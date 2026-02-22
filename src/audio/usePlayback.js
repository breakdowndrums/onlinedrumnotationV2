import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { makeAudioEngine } from "./engine";
import { loadSamples } from "./sampleLoader";
import { SAMPLE_MAP } from "./sampleMap";

export function usePlayback({ instruments, grid, columns, bpm, resolution }) {
  const engine = useMemo(() => makeAudioEngine(), []);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const [error, setError] = useState(null);

  const snapRef = useRef({ instruments, grid, columns });

  useEffect(() => {
    snapRef.current = { instruments, grid, columns };
  }, [instruments, grid, columns]);

  useEffect(() => {
    engine.setTransport({ nextBpm: bpm, nextResolution: resolution });
  }, [engine, bpm, resolution]);

  useEffect(() => {
    engine.setOnStep((step) => setPlayhead(step));
  }, [engine]);

  const initSamples = useCallback(async () => {
    try {
      setError(null);
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
        if (!isReady) {
          await initSamples();
        }

        const startStep =
          typeof opts.startStep === "number" ? opts.startStep : playhead;

        if (typeof opts.startStep === "number") {
          setPlayhead(startStep);
        }

        await engine.play(() => snapRef.current, { startStep });
        setIsPlaying(true);
      } catch (e) {
        setIsPlaying(false);
        throw e;
      }
    },
    [engine, initSamples, isReady, playhead]
  );

  const stop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
  }, [engine]);

  return {
    isReady,
    isPlaying,
    playhead,
    error,
    play,
    stop,
    initSamples,
    setPlayhead,
  };
}
