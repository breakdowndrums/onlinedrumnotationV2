export function makeAudioEngine() {
  let audioCtx = null;
  let master = null;

  // Transport
  let isPlaying = false;
  let bpm = 120;
  let resolution = 16;
  let transportColumns = 32;

  // Scheduler state
  let currentStep = 0;
  let nextNoteTime = 0;
  let timerId = null;
  let activeSources = new Set();
  let openHats = [];

  // Lookahead
  const lookaheadMs = 25;
  const scheduleAheadTimeSec = 0.12;

  let buffers = {}; // instId -> AudioBuffer
  let onStep = null; // (stepIndex) => void

  function ensureContext() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    master = audioCtx.createGain();
    master.gain.value = 0.9;
    master.connect(audioCtx.destination);
  }

  async function resumeIfNeeded() {
    ensureContext();
    if (audioCtx.state !== "running") await audioCtx.resume();
  }

  // iOS Safari requires an explicit unlock in a user gesture.
  // This resumes the context and plays a tiny silent buffer to enable audio output.
  async function unlock() {
    ensureContext();
    try {
      if (audioCtx.state !== "running") {
        await audioCtx.resume();
      }
      const buf = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      src.connect(master);
      const t = audioCtx.currentTime + 0.001;
      src.start(t);
      src.stop(t + 0.01);
    } catch (_) {
      // ignore
    }
  }


  function getContext() {
    return audioCtx;
  }

  function setBuffers(next) {
    buffers = next || {};
  }

  function setTransport({ nextBpm, nextResolution, nextColumns }) {
    if (typeof nextBpm === "number") bpm = nextBpm;
    if (typeof nextResolution === "number") resolution = nextResolution;
    if (typeof nextColumns === "number" && Number.isFinite(nextColumns) && nextColumns > 0) {
      const prevColumns = Math.max(1, transportColumns);
      const mappedColumns = Math.max(1, Math.floor(nextColumns));

      // Keep musical phase stable when step grid size changes (e.g. 8th -> 16th).
      if (isPlaying && mappedColumns !== prevColumns) {
        const phase = ((currentStep % prevColumns) + prevColumns) % prevColumns;
        currentStep = Math.floor((phase / prevColumns) * mappedColumns) % mappedColumns;
      } else {
        currentStep = Math.min(currentStep, mappedColumns - 1);
      }

      transportColumns = mappedColumns;
    }
  }

  function secondsPerStep() {
    // BPM is quarter-notes per minute
    return (60 / bpm) * (4 / resolution);
  }

  
  function triggerWithGain(instId, time, gainValue = 1) {
    if (!audioCtx || !master) return null;
    const buf = buffers[instId];
    if (!buf) return null;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    activeSources.add(src);
    src.onended = () => {
      activeSources.delete(src);
      openHats = openHats.filter((h) => h?.src !== src);
    };

    const gain = audioCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, gainValue));

    src.connect(gain);
    gain.connect(master);

    src.start(time);
    return { src, gain };
  }


  function chokeOpenHats(time) {
    if (!openHats.length) return;
    const hats = openHats;
    openHats = [];
    hats.forEach((h) => {
      if (!h?.src || !h?.gain) return;
      try {
        const g = h.gain.gain;
        g.setValueAtTime(g.value, time);
        g.linearRampToValueAtTime(0.0001, time + 0.01);
        h.src.stop(time + 0.012);
      } catch (e) {}
    });
  }

function trigger(instId, time, gainValue = 1) {
    if (!audioCtx || !master) return;
    const buf = buffers[instId];
    if (!buf) return;

    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    activeSources.add(src);
    src.onended = () => {
      activeSources.delete(src);
      openHats = openHats.filter((h) => h?.src !== src);
    };

    const gain = audioCtx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, gainValue));

    src.connect(gain);
    gain.connect(master);

    src.start(time);
    return src;
  }

  function scheduleStep(grid, instruments, stepIndex, time) {
    for (const inst of instruments) {
      const state = grid[inst.id]?.[stepIndex] ?? "off";
      if (state === "off") continue;

      // Ghost notes: instrument-specific gain
      if (state === "ghost") {
        if (inst.id === "snare" && buffers["snare_ghost"]) {
          trigger("snare_ghost", time, 0.6);
        } else if (inst.id === "hihat") {
          chokeOpenHats(time);
          trigger(inst.id, time, 0.3);
        } else if (inst.id === "tom1" || inst.id === "tom2" || inst.id === "floorTom") {
          trigger(inst.id, time, 0.15);
        } else {
          // fallback ghost gain
          trigger(inst.id, time, 0.1);
        }
        continue;
      }

      // Normal hit
      if (inst.id === "hihat" || inst.id === "hihatFoot") {
        chokeOpenHats(time);
      }
      if (inst.id === "hihatOpen") {
        {
          const h = triggerWithGain(inst.id, time, 0.9);
          if (h) openHats.push(h);
        }
      } else {
        trigger(inst.id, time, 0.9);
      }
    }
    if (onStep) onStep(stepIndex);
  }

  function scheduler(getGridSnapshot) {
    if (!audioCtx) return;

    const { grid, instruments, columns } = getGridSnapshot();

    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTimeSec) {
      scheduleStep(grid, instruments, currentStep, nextNoteTime);

      nextNoteTime += secondsPerStep();
      currentStep += 1;
      if (currentStep >= columns) currentStep = 0;
    }
  }

  async function play(getGridSnapshot, { startStep = 0 } = {}) {
    await resumeIfNeeded();
    if (isPlaying) return;

    const snap = getGridSnapshot();
    const maxStep = Math.max(0, (snap.columns ?? 1) - 1);
    transportColumns = Math.max(1, snap.columns ?? 1);
    currentStep = Math.max(0, Math.min(maxStep, startStep));
    nextNoteTime = audioCtx.currentTime + 0.03;

    isPlaying = true;
    timerId = window.setInterval(() => scheduler(getGridSnapshot), lookaheadMs);
  }

  function stop() {
    if (!isPlaying) return;

    isPlaying = false;

    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }

    // Kill any already-scheduled sounds
    activeSources.forEach((src) => {
      try { src.stop(0); } catch (e) {}
    });
    activeSources.clear();
    openHats = [];

    // Reset transport so next play always starts from beginning
    currentStep = 0;
    nextNoteTime = 0;
  }

  function setOnStep(fn) {
    onStep = fn;
  }

  return {
    ensureContext,
    getContext,
    resumeIfNeeded,
    unlock,
    setBuffers,
    setTransport,
    setOnStep,
    play,
    stop,
  };
}
