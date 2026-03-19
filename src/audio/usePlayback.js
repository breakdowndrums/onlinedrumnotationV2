import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { makeAudioEngine } from "./engine";
import { loadSamples } from "./sampleLoader";
import { SAMPLE_MAP } from "./sampleMap";
import { primeIOSAudioSync } from "./iosPrime";

export function usePlayback({
  instruments,
  grid,
  columns,
  bpm,
  resolution,
  stepQuarterDurations,
  timeSig,
  metronomeEnabled,
  metronomeVolume,
}) {
  const engine = useMemo(() => makeAudioEngine(), []);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [stepMeta, setStepMeta] = useState(null);
  const [error, setError] = useState(null);
  const [startupLagMs, setStartupLagMs] = useState(0);
  const [slowStartDetected, setSlowStartDetected] = useState(false);
  const [endedNaturallyAt, setEndedNaturallyAt] = useState(0);

  const snapRef = useRef({ instruments, grid, columns, stepQuarterDurations });
  const pendingPlayStartTsRef = useRef(null);
  const firstStepSeenForPlayRef = useRef(false);

  useEffect(() => {
    snapRef.current = { instruments, grid, columns, stepQuarterDurations };
  }, [instruments, grid, columns, stepQuarterDurations]);

  useEffect(() => {
    engine.setTransport({
      nextBpm: bpm,
      nextResolution: resolution,
      nextColumns: columns,
      nextStepQuarterDurations: stepQuarterDurations,
      nextTimeSig: timeSig,
      nextMetronomeEnabled: metronomeEnabled,
      nextMetronomeVolume: metronomeVolume,
    });
  }, [engine, bpm, resolution, columns, stepQuarterDurations, timeSig, metronomeEnabled, metronomeVolume]);

  useEffect(() => {
    engine.setOnStep((step, meta) => {
      if (pendingPlayStartTsRef.current != null && !firstStepSeenForPlayRef.current) {
        const lag = Math.max(0, Math.round(performance.now() - pendingPlayStartTsRef.current));
        setStartupLagMs(lag);
        setSlowStartDetected(lag >= 900);
        firstStepSeenForPlayRef.current = true;
        pendingPlayStartTsRef.current = null;
      }
      setPlayhead(step);
      setStepMeta(meta || null);
    });
  }, [engine]);
  useEffect(() => {
    engine.setOnEnded(() => {
      setIsPlaying(false);
      setEndedNaturallyAt(Date.now());
      pendingPlayStartTsRef.current = null;
      firstStepSeenForPlayRef.current = false;
    });
  }, [engine]);

  const initSamples = useCallback(async () => {
    try {
      setError(null);
      // iOS: prime audio session via HTMLMediaElement
      primeIOSAudioSync();
      engine.unlock();
      engine.ensureContext();
      const ctx = engine.getContext();
      const buffers = await loadSamples(ctx, SAMPLE_MAP);
      engine.setBuffers(buffers);
      setIsReady(true);
    } catch (e) {
      const msg = e?.message || String(e);
      setError(msg);
      setIsReady(false);
      throw e;
    }
  }, [engine]);

  const play = useCallback(
    async (opts = {}) => {
      try {
        // iOS: prime audio session via HTMLMediaElement
        primeIOSAudioSync();
        engine.unlock();
        setError(null);
        setStartupLagMs(0);
        setSlowStartDetected(false);
        setEndedNaturallyAt(0);
        setStepMeta(null);
        pendingPlayStartTsRef.current = performance.now();
        firstStepSeenForPlayRef.current = false;
        if (!isReady) {
          await initSamples();
        }
        await engine.resumeIfNeeded();

        const startStep =
          typeof opts.startStep === "number" ? opts.startStep : playhead;

        if (typeof opts.startStep === "number") {
          setPlayhead(startStep);
        }

        try {
          await engine.play(() => snapRef.current, {
            startStep,
            countInBeats: opts.countInBeats,
            countInBeatDurSec: opts.countInBeatDurSec,
          });
        } catch (err) {
          // One retry after explicit unlock/resume helps on strict Chromium autoplay states.
          await engine.unlock();
          await engine.resumeIfNeeded();
          await engine.play(() => snapRef.current, {
            startStep,
            countInBeats: opts.countInBeats,
            countInBeatDurSec: opts.countInBeatDurSec,
          });
        }
        setIsPlaying(true);
      } catch (e) {
        setIsPlaying(false);
        const msg = e?.message || String(e);
        setError(msg);
        pendingPlayStartTsRef.current = null;
        firstStepSeenForPlayRef.current = false;
        throw e;
      }
    },
    [engine, initSamples, isReady, playhead]
  );

  const stop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
    setEndedNaturallyAt(0);
    setStepMeta(null);
    pendingPlayStartTsRef.current = null;
    firstStepSeenForPlayRef.current = false;
  }, [engine]);
  const hardStop = useCallback(() => {
    engine.hardStop();
    setIsPlaying(false);
    setEndedNaturallyAt(0);
    setStepMeta(null);
    pendingPlayStartTsRef.current = null;
    firstStepSeenForPlayRef.current = false;
  }, [engine]);
  const setTransportStep = useCallback((stepIndex = 0) => {
    engine.setCurrentStep(stepIndex);
    setPlayhead(Math.max(0, Math.floor(Number(stepIndex) || 0)));
  }, [engine]);
  const playCompiled = useCallback(
    async ({
      events = [],
      startAtSec = 0,
      totalDurationSec = 0,
      loop = false,
      countInBeats = 0,
      countInBeatDurSec = 0,
    } = {}) => {
      try {
        primeIOSAudioSync();
        engine.unlock();
        setError(null);
        setStartupLagMs(0);
        setSlowStartDetected(false);
        setEndedNaturallyAt(0);
        setStepMeta(null);
        pendingPlayStartTsRef.current = performance.now();
        firstStepSeenForPlayRef.current = false;
        if (!isReady) {
          await initSamples();
        }
        await engine.resumeIfNeeded();
        const startedAt = await engine.playCompiled(events, {
          startAtSec,
          totalDurationSec,
          loop,
          countInBeats,
          countInBeatDurSec,
        });
        setIsPlaying(true);
        return startedAt;
      } catch (e) {
        setIsPlaying(false);
        const msg = e?.message || String(e);
        setError(msg);
        pendingPlayStartTsRef.current = null;
        firstStepSeenForPlayRef.current = false;
        throw e;
      }
    },
    [engine, initSamples, isReady]
  );
  const setStopAtTime = useCallback((timeSec = null) => {
    engine.setStopAtTime(timeSec);
  }, [engine]);
  const getAudioTime = useCallback(() => engine.getCurrentTime(), [engine]);
  const getScheduleAheadTimeSec = useCallback(() => engine.getScheduleAheadTimeSec(), [engine]);

  return {
    isReady,
    isPlaying,
    playhead,
    stepMeta,
    error,
    startupLagMs,
    slowStartDetected,
    endedNaturallyAt,
    play,
    playCompiled,
    stop,
    hardStop,
    initSamples,
    setPlayhead,
    setTransportStep,
    setStopAtTime,
    getAudioTime,
    getScheduleAheadTimeSec,
  };
}
