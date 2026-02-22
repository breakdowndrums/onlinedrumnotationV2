import { useEffect, useMemo, useRef, useState } from "react";
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

    async function unlock() {
    try {
      setError(null);
      await engine.resumeIfNeeded();
    } catch (e) {
      console.error(e);
      setError(e);
    }
  }

async function initSamples() {
    try {
      setError(null);
      engine.ensureContext();
      await engine.resumeIfNeeded();
      const ctx = engine.getContext();
      const buffers = await loadSamples(ctx, SAMPLE_MAP);
      engine.setBuffers(buffers);
      setIsReady(true);
    } catch (e) {
      console.error(e);
      setError(e);
      setIsReady(false);
      throw e;
    }
  }

  async function play(opts = {}) {
    if (!isReady) await initSamples();
    setIsPlaying(true);
    const startStep = typeof opts.startStep === "number" ? opts.startStep : playhead;
    if (typeof opts.startStep === "number") setPlayhead(startStep);
    await engine.play(() => snapRef.current, { startStep });
  }

  function stop() {
    engine.stop();
    setIsPlaying(false);
  }

  return {
    isReady,
    unlock,
    isPlaying,
    playhead,
    error,
    setPlayhead,
    play,
    stop,
    initSamples,
  };
}