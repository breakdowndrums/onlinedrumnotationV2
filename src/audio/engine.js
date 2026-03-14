export function makeAudioEngine() {
  let audioCtx = null;
  let master = null;

  // Transport
  let isPlaying = false;
  let bpm = 120;
  let resolution = 16;
  let transportColumns = 32;
  let stepQuarterDurations = [];

  // Scheduler state
  let currentStep = 0;
  let nextNoteTime = 0;
  let timerId = null;
  let activeSources = new Set();
  let openHats = [];
  let stopAtTime = null;
  let onEnded = null;
  let playMode = "grid";
  let compiledEvents = [];
  let compiledCursor = 0;
  let compiledLoop = false;
  let compiledDurationSec = 0;
  let compiledStartOffsetSec = 0;
  let compiledLoopIteration = 0;
  let playStartTime = 0;

  // Lookahead
  const lookaheadMs = 25;
  const scheduleAheadTimeSec = 0.12;

  let buffers = {}; // instId -> AudioBuffer
  let onStep = null; // (stepIndex, meta?) => void

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

  function setTransport({ nextBpm, nextResolution, nextColumns, nextStepQuarterDurations }) {
    if (typeof nextBpm === "number") bpm = nextBpm;
    if (typeof nextResolution === "number") resolution = nextResolution;
    const prevStepQuarterDurations = stepQuarterDurations;
    if (Array.isArray(nextStepQuarterDurations) && nextStepQuarterDurations.length > 0) {
      stepQuarterDurations = nextStepQuarterDurations.map((v) =>
        Number.isFinite(v) && v > 0 ? Number(v) : 1 / Math.max(1, resolution / 4)
      );
    } else {
      stepQuarterDurations = [];
    }
    if (typeof nextColumns === "number" && Number.isFinite(nextColumns) && nextColumns > 0) {
      const prevColumns = Math.max(1, transportColumns);
      const mappedColumns = Math.max(1, Math.floor(nextColumns));
      const prevDurations =
        prevStepQuarterDurations.length === prevColumns
          ? prevStepQuarterDurations
          : Array.from({ length: prevColumns }, () => 1 / Math.max(1, resolution / 4));
      const nextDurations =
        stepQuarterDurations.length === mappedColumns
          ? stepQuarterDurations
          : Array.from({ length: mappedColumns }, () => 1 / Math.max(1, resolution / 4));
      const sum = (arr) => arr.reduce((a, b) => a + b, 0);
      const prevTotal = Math.max(1e-6, sum(prevDurations));
      const nextTotal = Math.max(1e-6, sum(nextDurations));

      // Keep musical phase stable when step grid size changes (e.g. 8th -> 16th).
      const durationsChanged =
        prevDurations.length !== nextDurations.length ||
        prevDurations.some((v, i) => Math.abs(v - (nextDurations[i] ?? v)) > 1e-8);
      if (isPlaying && (mappedColumns !== prevColumns || durationsChanged)) {
        const safeStep = ((currentStep % prevColumns) + prevColumns) % prevColumns;
        let elapsed = 0;
        for (let i = 0; i < safeStep; i++) elapsed += prevDurations[i] ?? 0;
        const target = (elapsed / prevTotal) * nextTotal;
        let acc = 0;
        let mappedStep = 0;
        for (let i = 0; i < mappedColumns; i++) {
          const nextAcc = acc + (nextDurations[i] ?? 0);
          if (target < nextAcc) {
            mappedStep = i;
            break;
          }
          acc = nextAcc;
          mappedStep = i;
        }
        currentStep = mappedStep % mappedColumns;
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

  function secondsForStep(stepIndex) {
    if (Array.isArray(stepQuarterDurations) && stepQuarterDurations.length === transportColumns) {
      const q = stepQuarterDurations[Math.max(0, Math.min(transportColumns - 1, stepIndex))] ?? (1 / Math.max(1, resolution / 4));
      return (60 / bpm) * q;
    }
    return secondsPerStep();
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
    if (onStep) onStep(stepIndex, null);
  }

  function scheduleCompiledEvent(event, time) {
    if (!event) return;
    const hits = Array.isArray(event.hits) ? event.hits : [];
    for (const hit of hits) {
      const instId = hit?.instId;
      const state = hit?.state ?? "off";
      if (!instId || state === "off") continue;
      if (state === "ghost") {
        if (instId === "snare" && buffers["snare_ghost"]) {
          trigger("snare_ghost", time, 0.6);
        } else if (instId === "hihat") {
          chokeOpenHats(time);
          trigger(instId, time, 0.3);
        } else if (instId === "tom1" || instId === "tom2" || instId === "floorTom") {
          trigger(instId, time, 0.15);
        } else {
          trigger(instId, time, 0.1);
        }
        continue;
      }
      if (instId === "hihat" || instId === "hihatFoot") chokeOpenHats(time);
      if (instId === "hihatOpen") {
        const h = triggerWithGain(instId, time, 0.9);
        if (h) openHats.push(h);
      } else {
        trigger(instId, time, state === "accent" ? 1 : 0.9);
      }
    }
    if (onStep) onStep(event.stepIndex ?? 0, event.meta || null);
  }

  function finishNaturally() {
    isPlaying = false;
    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }
    currentStep = 0;
    nextNoteTime = 0;
    stopAtTime = null;
    if (onEnded) onEnded();
  }

  function scheduler(getGridSnapshot) {
    if (!audioCtx) return;

    if (stopAtTime != null && audioCtx.currentTime >= stopAtTime) {
      finishNaturally();
      return;
    }

    if (playMode === "compiled") {
      while (compiledEvents.length > 0) {
        if (compiledCursor >= compiledEvents.length) {
          if (!compiledLoop) break;
          compiledCursor = 0;
          compiledLoopIteration += 1;
        }
        const event = compiledEvents[compiledCursor];
        const eventTimeSec =
          playStartTime + compiledLoopIteration * compiledDurationSec + (Number(event?.timeSec) || 0);
        if (eventTimeSec >= audioCtx.currentTime + scheduleAheadTimeSec) break;
        if (stopAtTime != null && eventTimeSec >= stopAtTime - 1e-6) break;
        scheduleCompiledEvent(event, eventTimeSec);
        compiledCursor += 1;
      }
    } else {
      const { grid, instruments, columns } = getGridSnapshot();
      while (nextNoteTime < audioCtx.currentTime + scheduleAheadTimeSec) {
        if (stopAtTime != null && nextNoteTime >= stopAtTime - 1e-6) {
          break;
        }
        scheduleStep(grid, instruments, currentStep, nextNoteTime);

        nextNoteTime += secondsForStep(currentStep);
        currentStep += 1;
        if (currentStep >= columns) currentStep = 0;
      }
    }

    if (stopAtTime != null && audioCtx.currentTime >= stopAtTime) {
      finishNaturally();
    }
  }

  async function play(getGridSnapshot, { startStep = 0 } = {}) {
    await resumeIfNeeded();
    if (isPlaying) return;

    playMode = "grid";
    compiledEvents = [];
    compiledCursor = 0;
    compiledLoop = false;
    compiledDurationSec = 0;
    compiledStartOffsetSec = 0;
    compiledLoopIteration = 0;
    const snap = getGridSnapshot();
    const maxStep = Math.max(0, (snap.columns ?? 1) - 1);
    transportColumns = Math.max(1, snap.columns ?? 1);
    currentStep = Math.max(0, Math.min(maxStep, startStep));
    playStartTime = audioCtx.currentTime + 0.03;
    nextNoteTime = playStartTime;
    stopAtTime = null;

    isPlaying = true;
    timerId = window.setInterval(() => scheduler(getGridSnapshot), lookaheadMs);
    return playStartTime;
  }

  async function playCompiled(events, { startAtSec = 0, totalDurationSec = 0, loop = false } = {}) {
    await resumeIfNeeded();
    if (isPlaying) return null;

    playMode = "compiled";
    compiledEvents = (Array.isArray(events) ? events : [])
      .map((event) => ({
        ...event,
        timeSec: Math.max(0, Number(event?.timeSec) || 0),
      }))
      .sort((a, b) => (a.timeSec - b.timeSec) || ((a.stepIndex ?? 0) - (b.stepIndex ?? 0)));
    compiledLoop = loop === true;
    compiledDurationSec = Math.max(0, Number(totalDurationSec) || 0);
    compiledStartOffsetSec = Math.max(0, Number(startAtSec) || 0);
    compiledLoopIteration = 0;
    playStartTime = audioCtx.currentTime + 0.03 - compiledStartOffsetSec;
    compiledCursor = compiledEvents.findIndex((event) => event.timeSec >= compiledStartOffsetSec - 1e-6);
    if (compiledCursor < 0) {
      compiledCursor = compiledLoop ? 0 : compiledEvents.length;
    }
    nextNoteTime = 0;
    stopAtTime = compiledLoop ? null : playStartTime + compiledDurationSec;

    isPlaying = true;
    timerId = window.setInterval(() => scheduler(() => ({ grid: {}, instruments: [], columns: 1 })), lookaheadMs);
    return playStartTime;
  }

  function stop() {
    if (!isPlaying) return;

    isPlaying = false;

    if (timerId) {
      window.clearInterval(timerId);
      timerId = null;
    }

    // Reset transport so next play always starts from beginning.
    // Already-triggered sounds are allowed to ring out.
    currentStep = 0;
    nextNoteTime = 0;
    playStartTime = 0;
    compiledLoopIteration = 0;
    stopAtTime = null;
  }

  function hardStop() {
    stop();

    // Kill any already-scheduled sounds
    activeSources.forEach((src) => {
      try { src.stop(0); } catch (e) {}
    });
    activeSources.clear();
    openHats = [];

    // Ensure no scheduled natural-end callback lingers.
    stopAtTime = null;
  }

  function setOnStep(fn) {
    onStep = fn;
  }

  function setOnEnded(fn) {
    onEnded = fn;
  }

  function getCurrentTime() {
    if (!audioCtx) return 0;
    return audioCtx.currentTime;
  }

  function getScheduleAheadTimeSec() {
    return scheduleAheadTimeSec;
  }

  function setCurrentStep(stepIndex = 0) {
    const maxStep = Math.max(0, transportColumns - 1);
    currentStep = Math.max(0, Math.min(maxStep, Math.floor(Number(stepIndex) || 0)));
  }

  function setStopAtTime(timeSec = null) {
    stopAtTime = Number.isFinite(timeSec) && timeSec > 0 ? Number(timeSec) : null;
  }

  return {
    ensureContext,
    getContext,
    resumeIfNeeded,
    unlock,
    setBuffers,
    setTransport,
    setOnStep,
    setOnEnded,
    getCurrentTime,
    getScheduleAheadTimeSec,
    setCurrentStep,
    setStopAtTime,
    play,
    playCompiled,
    stop,
    hardStop,
  };
}
