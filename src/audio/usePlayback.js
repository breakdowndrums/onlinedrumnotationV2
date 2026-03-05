import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { makeAudioEngine } from "./engine";
import { loadSamples } from "./sampleLoader";
import { SAMPLE_MAP } from "./sampleMap";
import { primeIOSAudioSync } from "./iosPrime";

export function usePlayback({ instruments, grid, columns, bpm, resolution, stepQuarterDurations }) {
  const engine = useMemo(() => makeAudioEngine(), []);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [error, setError] = useState(null);
  const [startupLagMs, setStartupLagMs] = useState(0);
  const [slowStartDetected, setSlowStartDetected] = useState(false);

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
    });
  }, [engine, bpm, resolution, columns, stepQuarterDurations]);

  useEffect(() => {
    engine.setOnStep((step) => {
      if (pendingPlayStartTsRef.current != null && !firstStepSeenForPlayRef.current) {
        const lag = Math.max(0, Math.round(performance.now() - pendingPlayStartTsRef.current));
        setStartupLagMs(lag);
        setSlowStartDetected(lag >= 900);
        firstStepSeenForPlayRef.current = true;
        pendingPlayStartTsRef.current = null;
      }
      setPlayhead(step);
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
          await engine.play(() => snapRef.current, { startStep });
        } catch (err) {
          // One retry after explicit unlock/resume helps on strict Chromium autoplay states.
          await engine.unlock();
          await engine.resumeIfNeeded();
          await engine.play(() => snapRef.current, { startStep });
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
    pendingPlayStartTsRef.current = null;
    firstStepSeenForPlayRef.current = false;
  }, [engine]);

  return {
    isReady,
    isPlaying,
    playhead,
    error,
    startupLagMs,
    slowStartDetected,
    play,
    stop,
    initSamples,
    setPlayhead,
  };
}
