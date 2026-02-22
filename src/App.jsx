import React, { useEffect, useRef, useState } from "react";
import { exportNotationPdf } from "./utils/exportNotationPdf";
import { usePlayback } from "./audio/usePlayback";
import * as Vex from "vexflow";

// VexFlow API
const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Fraction, Barline } = Vex.Flow;

// ====================
// INSTRUMENT SET (MVP+)
// ====================

const INSTRUMENTS = [
  { id: "crash2", label: "Crash 2", midi: 57 },
  { id: "crash1", label: "Crash 1", midi: 49 },
  { id: "ride", label: "Ride", midi: 51 },
  { id: "hihatFoot", label: "HH Foot", midi: 44 },
  { id: "tom1", label: "Tom 1", midi: 48 },
  { id: "tom2", label: "Tom 2", midi: 45 },
  { id: "floorTom", label: "Floor Tom", midi: 41 },
  { id: "hihat", label: "Hi-Hat", midi: 42 },
  { id: "snare", label: "Snare", midi: 38 },
  { id: "kick", label: "Kick", midi: 36 }
];


const CELL = {
  OFF: "off",
  ON: "on",
  GHOST: "ghost",
};

const GHOST_NOTATION_ENABLED = new Set(["snare", "tom1", "tom2", "floorTom", "hihat"]);

const CELL_CYCLE = [CELL.OFF, CELL.ON];

// Visuals
const CELL_COLOR = {
  [CELL.OFF]: "bg-neutral-800",
  [CELL.ON]: "bg-[#00b3ba]",
  [CELL.GHOST]: "bg-[#00b3ba]/35",
};

// Ghost note support (MVP)
const GHOST_ENABLED = new Set(["snare", "tom1", "tom2", "floorTom", "hihat"]);

// NOTE: mapping is a starting point; we'll refine staff positions later.
const NOTATION_MAP = {
  kick: { key: "f/4" },
  snare: { key: "c/5" },

  // Cymbals / hats use X noteheads
  hihat: { key: "g/5/x2", x: true },
  hihatFoot: { key: "d/4/x2", x: true },
  ride: { key: "f/5/x2", x: true },
  crash1: { key: "a/5/x2", x: true },
  crash2: { key: "b/5/x2", x: true },

  // Toms
  tom2: { key: "d/5" },
  tom1: { key: "e/5" },
  floorTom: { key: "a/4" },
};

export default function App() {
  const [resolution, setResolution] = useState(8); // 4, 8, 16, 32
  const [bars, setBars] = useState(2);
  const [barsPerLine, setBarsPerLine] = useState(4);
  const [gridBarsPerLine, setGridBarsPerLine] = useState(4);
  const [layout, setLayout] = useState("grid-top");
  const [activeTab, setActiveTab] = useState("timing"); // grid-right | grid-top | notation-right | notation-top
  const [timeSig, setTimeSig] = useState({ n: 4, d: 4 });
  const [keepTiming, setKeepTiming] = useState(true);

  const [bpm, setBpm] = useState(120);

  const [selection, setSelection] = useState(null);
  
  const selectionCellCount = selection
    ? (Math.max(0, (selection.endExclusive ?? 0) - (selection.start ?? 0)) *
       Math.max(1, (selection.rowEnd ?? selection.rowStart ?? 0) - (selection.rowStart ?? 0) + 1))
    : 0;
  const canClearSelection = selectionCellCount >= 2;
// Keyboard shortcut: Backspace/Delete clears current selection (like Clear button)
  useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && selection) {
        e.preventDefault();
        setBaseGrid((prev) => {
          const next = {};
          for (const instId of Object.keys(prev)) next[instId] = [...prev[instId]];
          const start = selection.start;
          const end = selection.endExclusive;
          for (let r = selection.rowStart; r <= selection.rowEnd; r++) {
            const instId = INSTRUMENTS[r].id;
            for (let c = start; c < end; c++) next[instId][c] = CELL.OFF;
          }
          return next;
        });
        setLoopRule(null);
        setSelection(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection]);
 // { rowStart, rowEnd, start, endExclusive } (row indices into INSTRUMENTS)
  const [loopRule, setLoopRule] = useState(null);

  
  // Whether new selections should auto-generate a loop.
  const [loopModeEnabled, setLoopModeEnabled] = useState(true);
// If selection collapses to a single cell while looping is active, drop the loop.
  useEffect(() => {
    if (!loopRule) return;
    const width = selection ? (selection.endExclusive - selection.start) : 0;
    if (width < 2) {
      setLoopRule(null);
    }
  }, [selection, loopRule]);


  useEffect(() => {
    if (loopModeEnabled) return;
    if (loopRule) setLoopRule(null);
  }, [loopModeEnabled, loopRule]);
// { rowStart, rowEnd, start, length }
  const [mergeRests, setMergeRests] = useState(true);
  const [mergeNotes, setMergeNotes] = useState(true);
  const [dottedNotes, setDottedNotes] = useState(true);
// "fast" (>=16ths) | "all"

  const stepsPerBar = Math.max(1, Math.round((timeSig.n * resolution) / timeSig.d));
  const columns = bars * stepsPerBar;


  const computeStepsPerBar = (ts, res) => Math.max(1, Math.round((ts.n * res) / ts.d));

  const remapGrid = (prevGrid, oldStepsPerBar, newStepsPerBar) => {
    const next = {};
    INSTRUMENTS.forEach((inst) => {
      const out = Array(bars * newStepsPerBar).fill(CELL.OFF);
      for (let b = 0; b < bars; b++) {
        for (let s = 0; s < oldStepsPerBar; s++) {
          const oldGlobal = b * oldStepsPerBar + s;
          const val = prevGrid[inst.id]?.[oldGlobal] ?? CELL.OFF;
          if (val === CELL.OFF) continue;

          const newLocal = Math.round((s * newStepsPerBar) / oldStepsPerBar);
          const clamped = Math.min(newStepsPerBar - 1, Math.max(0, newLocal));
          const newGlobal = b * newStepsPerBar + clamped;

          // Merge collisions: prefer ON over GHOST over OFF
          const cur = out[newGlobal] ?? CELL.OFF;
          const rank = (v) => (v === CELL.ON ? 2 : v === CELL.GHOST ? 1 : 0);
          out[newGlobal] = rank(val) >= rank(cur) ? val : cur;
        }
      }
      next[inst.id] = out;
    });
    return next;
  };

  const handleResolutionChange = (newRes) => {
    if (!keepTiming) {
      setResolution(newRes);
      return;
    }
    const oldSPB = stepsPerBar;
    const newSPB = computeStepsPerBar(timeSig, newRes);
    setBaseGrid((prev) => remapGrid(prev, oldSPB, newSPB));
    setResolution(newRes);
  };

  const handleTimeSigChange = (newTS) => {
    if (!keepTiming) {
      setTimeSig(newTS);
      return;
    }
    const oldSPB = stepsPerBar;
    const newSPB = computeStepsPerBar(newTS, resolution);
    setBaseGrid((prev) => remapGrid(prev, oldSPB, newSPB));
    setTimeSig(newTS);
  };



  const [baseGrid, setBaseGrid] = useState(() => {
    const g = {};
    INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(CELL.OFF)));
    return g;
  });


  const bakeLoopInto = (prevGrid, rule) => {
    const next = {};
    INSTRUMENTS.forEach((inst) => (next[inst.id] = [...(prevGrid[inst.id] || [])]));

    const { rowStart, rowEnd, start, length } = rule;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = INSTRUMENTS[r].id;
      srcByRow[instId] = next[instId].slice(start, start + length);
    }

    // Repeat the loop pattern all the way to the end, even if the remaining
    // cells don't fit an exact multiple of `length`.
    for (let idx = start + length; idx < columns; idx++) {
      const i = (idx - start) % length;
      for (let r = rowStart; r <= rowEnd; r++) {
        const instId = INSTRUMENTS[r].id;
        next[instId][idx] = (srcByRow[instId]?.[i] ?? CELL.OFF);
      }
    }
    return next;
  };

  const computedGrid = React.useMemo(() => {
    const g = {};
    INSTRUMENTS.forEach((inst) => (g[inst.id] = [...(baseGrid[inst.id] || [])]));

    if (!loopRule || loopRule.length < 2) return g;

    const { rowStart, rowEnd, start, length } = loopRule;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = INSTRUMENTS[r].id;
      srcByRow[instId] = (baseGrid[instId] || []).slice(start, start + length);
    }

    // Repeat the loop pattern all the way to the end, even if the remaining
    // cells don't fit an exact multiple of `length`.
    for (let idx = start + length; idx < columns; idx++) {
      const i = (idx - start) % length;
      for (let r = rowStart; r <= rowEnd; r++) {
        const instId = INSTRUMENTS[r].id;
        g[instId][idx] = (srcByRow[instId]?.[i] ?? CELL.OFF); // overwrite, including 0
      }
    }
    return g;
  }, [baseGrid, loopRule, columns]);

  const playback = usePlayback({
    instruments: INSTRUMENTS,
    grid: computedGrid,
    columns,
    bpm,
    resolution,
  });

  // Bulletproof iOS audio unlock: resume AudioContext on the first user gesture.
  useEffect(() => {
    let done = false;
    const unlockAudioOnce = () => {
      if (done) return;
      done = true;
      playback.unlock();
      window.removeEventListener("pointerdown", unlockAudioOnce, true);
      window.removeEventListener("touchstart", unlockAudioOnce, true);
      window.removeEventListener("mousedown", unlockAudioOnce, true);
    };
    window.addEventListener("pointerdown", unlockAudioOnce, true);
    window.addEventListener("touchstart", unlockAudioOnce, true);
    window.addEventListener("mousedown", unlockAudioOnce, true);
    return () => {
      window.removeEventListener("pointerdown", unlockAudioOnce, true);
      window.removeEventListener("touchstart", unlockAudioOnce, true);
      window.removeEventListener("mousedown", unlockAudioOnce, true);
    };
  }, [playback]);

  // Unified transport toggle: matches Spacebar + Play button behavior exactly.
  const togglePlaybackFromBeginning = React.useCallback(() => {
    if (playback.isPlaying) {
      playback.stop();
} else {
      playback.setPlayhead(0);
      playback.play({ startStep: 0 });
    }
  }, [playback.isPlaying, playback.play, playback.stop, playback.setPlayhead]);

  
  const notationExportRef = useRef(null);

  const setNotationExportEl = React.useCallback((el) => {
    if (el) notationExportRef.current = el;
  }, []);
// Spacebar toggles Play/Stop (avoid stealing space when typing)
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" && e.key !== " ") return;

      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || el?.isContentEditable;
      if (isTyping) return;

      e.preventDefault();
      togglePlaybackFromBeginning();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlaybackFromBeginning]);

  useEffect(() => {
    playback.setPlayhead((prev) => Math.max(0, Math.min(columns - 1, prev)));
  }, [columns]);



  // Resize grid when resolution/bars change (preserve existing hits)
  useEffect(() => {
    setBaseGrid((prev) => {
      const next = {};
      INSTRUMENTS.forEach((i) => {
        next[i.id] = Array(columns)
          .fill(CELL.OFF)
          .map((_, idx) => prev[i.id]?.[idx] ?? CELL.OFF);
      });
      return next;
    });
  }, [columns]);

  
  
  
  const cycleVelocity = (inst, idx) => {
    if (loopRule) {
      const r = INSTRUMENTS.findIndex((x) => x.id === inst);
      const inLoopRows = r >= loopRule.rowStart && r <= loopRule.rowEnd;
      const inSourceCols = idx >= loopRule.start && idx < loopRule.start + loopRule.length;
      const inSource = inLoopRows && inSourceCols;

      const inGenerated = inLoopRows && idx >= loopRule.start + loopRule.length;

      // Rule:
      // - Click inside source: edit source live (no bake)
      // - Click anywhere else (including generated area): bake loop and exit loop mode (NO toggle on this click)
      if (!inSource || inGenerated) {
        setBaseGrid((prev) => bakeLoopInto(prev, loopRule));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    // Normal edit (or edit within loop source)
    setBaseGrid((prev) => {
      const next = { ...prev };
      const current = prev[inst][idx];
      // Ghost behaves like "on" for regular toggling.
      const normalized = current === CELL.GHOST ? CELL.ON : current;
      const nextVal = normalized === CELL.OFF ? CELL.ON : CELL.OFF;
      next[inst] = [...prev[inst]];
      next[inst][idx] = nextVal;
      return next;
    });
  };

  const toggleGhost = (inst, idx) => {
    if (!GHOST_ENABLED.has(inst)) return;

    if (loopRule) {
      const r = INSTRUMENTS.findIndex((x) => x.id === inst);
      const inLoopRows = r >= loopRule.rowStart && r <= loopRule.rowEnd;
      const inSourceCols = idx >= loopRule.start && idx < loopRule.start + loopRule.length;
      const inSource = inLoopRows && inSourceCols;
      const inGenerated = inLoopRows && idx >= loopRule.start + loopRule.length;

      // Match click behavior: long-pressing outside the source bakes & exits without toggling.
      if (!inSource || inGenerated) {
        setBaseGrid((prev) => bakeLoopInto(prev, loopRule));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    setBaseGrid((prev) => {
      const next = { ...prev };
      const current = prev[inst][idx];

      // Only toggle ghost on active cells.
      if (current === CELL.OFF) return prev;

      const nextVal = current === CELL.GHOST ? CELL.ON : CELL.GHOST;

      next[inst] = [...prev[inst]];
      next[inst][idx] = nextVal;
      return next;
    });
  };


  return (
    <div
      className="min-h-screen bg-neutral-900 text-white p-6"
      onMouseDown={(e) => {
        if (!loopRule) return;
        const el = e.target;
        // If click is NOT on a grid cell, dismiss looping (no bake)
        if (el && el.closest && el.closest("[data-gridcell='1']")) return;
        if (el && el.closest && el.closest("[data-loopui='1']")) return;
        setLoopRule(null);
        setSelection(null);
      }}
    >
      
      <header className="flex flex-col gap-3" data-loopui='1'>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold mr-2">Drum Grid → Notation</h1>

          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("timing")}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "timing"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              timing
            </button>
            <button
              onClick={() => setActiveTab((t) => (t === "notation" ? "timing" : "notation"))}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "notation"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              notation
            </button>
            <button
              onClick={() => setActiveTab((t) => (t === "selection" ? "timing" : "selection"))}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "selection"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              selection
            </button>
          </div>


          
          <div className="flex items-center gap-2 ml-auto" data-loopui='1'>
            <button
              onClick={togglePlaybackFromBeginning}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${
                playback.isPlaying
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              {playback.isPlaying ? "stop" : "play"}
            </button>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">BPM</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setBpm((v) => Math.max(30, v - 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Decrease BPM"
                >
                  −
                </button>
                <div className="min-w-[56px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {bpm}
                </div>
                <button
                  type="button"
                  onClick={() => setBpm((v) => Math.min(300, v + 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Increase BPM"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={() => setActiveTab((t) => (t === "layout" ? "timing" : "layout"))}
              className={`px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "layout"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              layout
            </button>
          </div>

        </div>

        {activeTab === "timing" && (
          <div className="flex flex-wrap items-center gap-4">
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300 whitespace-nowrap">Resolution</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    const order = [4, 8, 16, 32];
                    const idx = order.indexOf(resolution);
                    const next = order[(idx - 1 + order.length) % order.length];
                    handleResolutionChange(next);
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  −
                </button>
                <div className="min-w-[60px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {resolution === 4 ? "4th" : resolution === 8 ? "8th" : resolution === 16 ? "16th" : "32th"}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const order = [4, 8, 16, 32];
                    const idx = order.indexOf(resolution);
                    const next = order[(idx + 1) % order.length];
                    handleResolutionChange(next);
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  +
                </button>
              </div>
            </div>


            <button
              type="button"
              onClick={() => setKeepTiming((v) => !v)}
              className={`px-3 py-[5px] rounded border text-sm ${
                keepTiming
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Keep timing when changing resolution (remap steps)"
            >
              Keep timing
            </button>


            
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Bars</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setBars((b) => Math.max(1, b - 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Decrease bars"
                >
                  −
                </button>
                <div className="min-w-[44px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {bars}
                </div>
                <button
                  type="button"
                  onClick={() => setBars((b) => Math.min(8, b + 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Increase bars"
                >
                  +
                </button>
              </div>
            </div>



            
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300 whitespace-nowrap">Time</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => {
                    const order = [
                      { n: 4, d: 4 },
                      { n: 3, d: 4 },
                      { n: 6, d: 8 },
                    ];
                    const idx = order.findIndex((x) => x.n === timeSig.n && x.d === timeSig.d);
                    const next = order[(idx - 1 + order.length) % order.length];
                    handleTimeSigChange(next);
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Previous time signature"
                >
                  −
                </button>
                <div className="min-w-[64px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {timeSig.n}/{timeSig.d}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const order = [
                      { n: 4, d: 4 },
                      { n: 3, d: 4 },
                      { n: 6, d: 8 },
                    ];
                    const idx = order.findIndex((x) => x.n === timeSig.n && x.d === timeSig.d);
                    const next = order[(idx + 1) % order.length];
                    handleTimeSigChange(next);
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Next time signature"
                >
                  +
                </button>
              </div>
            </div>

</div>
        )}

        {activeTab === "layout" && (
          <div className="flex flex-wrap items-center gap-4">

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300 whitespace-nowrap">Bars/line</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setBarsPerLine((v) => Math.max(1, v - 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  −
                </button>
                <div className="min-w-[44px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {barsPerLine}
                </div>
                <button
                  type="button"
                  onClick={() => setBarsPerLine((v) => Math.min(bars, v + 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300 whitespace-nowrap">Grid bars/line</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => setGridBarsPerLine((v) => Math.max(1, v - 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  −
                </button>
                <div className="min-w-[44px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                  {gridBarsPerLine}
                </div>
                <button
                  type="button"
                  onClick={() => setGridBarsPerLine((v) => Math.min(bars, v + 1))}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                >
                  +
                </button>
              </div>
            </div>

            <label className="text-sm text-neutral-300 flex items-center gap-2">
              <span className="whitespace-nowrap">Layout</span>
              <select
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
              >
                <option value="grid-top">Grid top / Notation bottom</option>
                <option value="notation-top">Notation top / Grid bottom</option>
                <option value="grid-right">Grid left / Notation right</option>
                <option value="notation-right">Notation left / Grid right</option>
              </select>
            </label>


</div>
        )}

        {activeTab === "selection" && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              disabled={!canClearSelection}
              onClick={() => {
                if (!canClearSelection) return;
if (!selection) return;
                // Clear base grid in selection area (ignores any active loop overlay)
                setBaseGrid((prev) => {
                  const next = {};
                  for (const instId of Object.keys(prev)) next[instId] = [...prev[instId]];
                  const start = selection.start;
                  const end = selection.endExclusive;
                  for (let r = selection.rowStart; r <= selection.rowEnd; r++) {
                    const instId = INSTRUMENTS[r].id;
                    for (let c = start; c < end; c++) next[instId][c] = CELL.OFF;
                  }
                  return next;
                });
                setLoopRule(null);
                setSelection(null);
              }}
              className={`px-3 py-[5px] rounded border text-sm   ${
                canClearSelection ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Clear notes in the selected region"
            >
              Clear
            </button>

            <button
              onClick={() => {
                setLoopModeEnabled((v) => !v);

                // If enabling looping mode and we already have a valid selection,
                // generate the loop immediately (no need to re-select).
                if (!loopModeEnabled) {
                  if (selection && selection.endExclusive - selection.start >= 2) {
                    setLoopRule({
                      rowStart: selection.rowStart,
                      rowEnd: selection.rowEnd,
                      start: selection.start,
                      length: selection.endExclusive - selection.start,
                    });
                  }
                } else {
                  // Turning looping mode off also removes any active loop.
                  setLoopRule(null);
                }
              }}
              className={`px-3 py-[5px] rounded border text-sm ${loopModeEnabled ? "bg-neutral-800 border-neutral-700 text-white" : "bg-neutral-900 border-neutral-800 text-neutral-600"}`}
              title={loopModeEnabled ? "Selection looping: ON" : "Selection looping: OFF"}
            >
              Looping
            </button>

            <button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
if (!loopRule) return;
                setBaseGrid((prev) => bakeLoopInto(prev, loopRule));
                setLoopRule(null);
                setSelection(null);
              }}
              className={`px-3 py-[5px] rounded border text-sm ${
                loopRule ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Bake loop: commit repeated notes and remove the active loop"
            >
              Bake loop
            </button>
          </div>
        )}{activeTab === "notation" && (
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => setMergeRests((v) => !v)}
              className={`px-3 py-[5px] rounded border text-sm ${
                mergeRests
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Merge consecutive rests (e.g., two 8th rests → one quarter rest)"
            >
              Merge rests
            </button>

            <button
              type="button"
              onClick={() => setMergeNotes((v) => !v)}
              className={`px-3 py-[5px] rounded border text-sm ${
                mergeNotes
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Merge notes across adjacent rests (e.g., 8ths on beats → quarters)"
            >
              Merge notes
            </button>

            {mergeNotes && (
              <button
                type="button"
                onClick={() => setDottedNotes((v) => !v)}
                className={`px-3 py-[5px] rounded border text-sm ${
                  dottedNotes
                    ? "bg-neutral-800 border-neutral-700 text-white"
                    : "bg-neutral-900 border-neutral-800 text-neutral-600"
                }`}
                title="Convert note + following rest into a dotted note (when possible)"
              >
                Dotted notes
              </button>
            )}

            

            <button
              onClick={async () => {
                try {
                  await exportNotationPdf(notationExportRef.current, { title: "drum-notation" });
                } catch (e) {
                  console.error(e);
                  alert(e?.message || "Failed to export PDF");
                }
              }}
              className="px-3 py-[5px] rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-600 hover:bg-neutral-800/60"
              title="Download the current notation as a PDF"
              type="button"
            >
              Download PDF
            </button>
          </div>
        )}
      </header>


      
      
      <main
        className={`mt-6 ${
          layout === "grid-right"
            ? "grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-6"
            : layout === "notation-right"
            ? "grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6"
            : "flex flex-col gap-6 items-start"
        }`}
      >
        {layout === "notation-right" || layout === "notation-top" ? (
          <>
            <div className="w-full" ref={setNotationExportEl}>
              <Notation
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
                dottedNotes={dottedNotes}
              />
            </div>

            <div className="w-full overflow-x-auto">
              <div className="inline-block align-top">
                <Grid
                grid={computedGrid}
                columns={columns}
                bars={bars}
                stepsPerBar={stepsPerBar}
                resolution={resolution}
                timeSig={timeSig}
                gridBarsPerLine={gridBarsPerLine}
                cycleVelocity={cycleVelocity}
                toggleGhost={toggleGhost}
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
                setLoopRule={setLoopRule}
                playhead={playback.playhead}
              />
            </div>
            </div>
          </>
        ) : (
          <>
            <div className="w-full overflow-x-auto">
              <div className="inline-block align-top">
                <Grid
                grid={computedGrid}
                columns={columns}
                bars={bars}
                stepsPerBar={stepsPerBar}
                resolution={resolution}
                timeSig={timeSig}
                gridBarsPerLine={gridBarsPerLine}
                cycleVelocity={cycleVelocity}
                toggleGhost={toggleGhost}
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
                setLoopRule={setLoopRule}
                playhead={playback.playhead}
              />
            </div>
            </div>

            <div className="w-full" ref={setNotationExportEl}>
              <Notation
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
                dottedNotes={dottedNotes}
              />
            </div>
          </>
        )}
      </main>


    </div>
  );
}


function Grid({
  grid, columns, bars, stepsPerBar, resolution, timeSig, gridBarsPerLine,
  cycleVelocity, toggleGhost, selection, setSelection, loopRule,
  setLoopRule, playhead
}) {

  const longPress = React.useRef({ timer: null, did: false });
  const [drag, setDrag] = useState(null); // { row, col }
  // Build a render timeline with a visual gap between bars.
  // Example for 2 bars of 8ths: [0..7, GAP, 8..15]
  const timeline = [];
  for (let b = 0; b < bars; b++) {
    for (let s = 0; s < stepsPerBar; s++) {
      timeline.push({ type: "step", stepIndex: b * stepsPerBar + s, bar: b, stepInBar: s });
    }
    if (b < bars - 1) timeline.push({ type: "gap" });
  }

  const labelFor = (stepInBar) => {
    // Beat unit is denominator (d). Steps per beat = resolution / d.
    const stepsPerBeat = Math.max(1, Math.round(resolution / timeSig.d));
    const beat = Math.floor(stepInBar / stepsPerBeat) + 1;
    const sub = stepInBar % stepsPerBeat;

    if (stepsPerBeat === 1) return `${beat}`;
    if (stepsPerBeat === 2) return sub === 0 ? `${beat}` : "&";
    if (stepsPerBeat === 4) return [String(beat), "e", "&", "a"][sub];
    return sub === 0 ? `${beat}` : "·";
  };


  
  const getCellRole = (instId, stepIndex) => {
    if (loopRule) {
      const r = INSTRUMENTS.findIndex((x) => x.id === instId);
      if (r >= loopRule.rowStart && r <= loopRule.rowEnd) {
        const inSrc = stepIndex >= loopRule.start && stepIndex < loopRule.start + loopRule.length;
        if (inSrc) return "source";
        if (stepIndex >= loopRule.start + loopRule.length) return "generated";
      }
    }

    // Only show selection outline if it spans at least 2 cells
    if (selection) {
      const width = selection.endExclusive - selection.start;
      if (width >= 2) {
        const r = INSTRUMENTS.findIndex((x) => x.id === instId);
        if (
          r >= selection.rowStart &&
          r <= selection.rowEnd &&
          stepIndex >= selection.start &&
          stepIndex < selection.endExclusive
        )
          return "selected";
      }
    }

    return "none";
  };



  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: Math.ceil(bars / Math.max(1, Math.min(bars, Number(gridBarsPerLine) || 1))) }).map((_, lineIdx) => {
        const perLine = Math.max(1, Math.min(bars, Number(gridBarsPerLine) || 1));
        const barStart = lineIdx * perLine;
        const barEnd = Math.min(bars, (lineIdx + 1) * perLine);
        const stepsInLine = (barEnd - barStart) * stepsPerBar;

        // Build timeline for this line (with visual bar gaps)
        const timeline = [];
        for (let b = barStart; b < barEnd; b++) {
          for (let s = 0; s < stepsPerBar; s++) {
            timeline.push({
              bar: b,
              stepInBar: s,
              stepIndex: b * stepsPerBar + s,
              type: "cell",
            });
          }
          if (b !== barEnd - 1) timeline.push({ type: "gap", key: `gap-${b}` });
        }

        return (
          <div key={`gridline-${lineIdx}`} className="grid gap-1" onMouseUp={(e) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        setDrag(null);
                        // Auto-enable looping when mouse is released after selecting a valid region.
                        if (loopRule) return;
                        if (!selection) return;
                        const width = selection.endExclusive - selection.start;
                        if (width < 2) return;
                        setLoopRule({
                          rowStart: selection.rowStart,
                          rowEnd: selection.rowEnd,
                          start: selection.start,
                          length: width,
                        });
                      }} style={{ gridTemplateColumns: `auto repeat(${timeline.length}, 28px)` }}>
            <div />
            {timeline.map((t, i) => {
              if (t.type === "gap") return <div key={t.key} />;
              const label = labelFor(t.stepInBar);
              return (
                <div
                  key={`h-${t.stepIndex}`}
                  className="relative h-6 text-xs text-center text-neutral-400 select-none overflow-visible"
                >
                  {/* Playhead indicator: kept within header row to avoid clipping/overlap. */}
                  {playhead === t.stepIndex && (
                    <span
                      className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full bg-neutral-700"
                      aria-hidden="true"
                    />
                  )}
                  <span className="absolute bottom-0 inset-x-0">{label}</span>
                </div>
              );
            })}

            {INSTRUMENTS.map((inst) => (
              <React.Fragment key={`${inst.id}-${lineIdx}`}>
                <div className="pr-2 text-xs text-right whitespace-nowrap select-none">{inst.label}</div>
                {timeline.map((t, i) => {
                  if (t.type === "gap") return <div key={`g-${inst.id}-${lineIdx}-${i}`} />;
                  const val = grid[inst.id]?.[t.stepIndex] ?? CELL.OFF;
                  return (
                    <div
                      key={`${inst.id}-${t.stepIndex}`}
                      data-gridcell="1"
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        // Long-press (250ms) on an active cell toggles ghost notes (where enabled).
                        const v = val;
                        if (v !== CELL.OFF && GHOST_ENABLED.has(inst.id)) {
                          longPress.current.did = false;
                          if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                          longPress.current.timer = window.setTimeout(() => {
                            longPress.current.did = true;
                            toggleGhost(inst.id, t.stepIndex);
                          }, 250);
                        }
                      }}
                      onPointerUp={() => {
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;
                      }}
                      onPointerCancel={() => {
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;
                      }}
                      onPointerLeave={() => {
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        // If the long-press fired, suppress the normal toggle.
                        if (longPress.current.did) {
                          longPress.current.did = false;
                          return;
                        }
                        cycleVelocity(inst.id, t.stepIndex);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (loopRule) return;
                        setDrag({ row: INSTRUMENTS.findIndex((x) => x.id === inst.id), col: t.stepIndex });
                        const r = INSTRUMENTS.findIndex((x) => x.id === inst.id);
                        setSelection({ rowStart: r, rowEnd: r, start: t.stepIndex, endExclusive: t.stepIndex + 1 });
                      }}
                      onMouseEnter={(e) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        if (loopRule) return;
                        if (!drag) return;
                        const r0 = drag.row;
                        const c0 = drag.col;
                        const r1 = INSTRUMENTS.findIndex((x) => x.id === inst.id);
                        const c1 = t.stepIndex;
                        const rowStart = Math.min(r0, r1);
                        const rowEnd = Math.max(r0, r1);
                        const start = Math.min(c0, c1);
                        const endExclusive = Math.max(c0, c1) + 1;
                        setSelection({ rowStart, rowEnd, start, endExclusive });
                      }}
                      onMouseUp={(e) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        setDrag(null);
                        // Auto-enable looping when mouse is released after selecting a valid region.
                        if (loopRule) return;
                        if (!selection) return;
                        const width = selection.endExclusive - selection.start;
                        if (width < 2) return;
                        setLoopRule({
                          rowStart: selection.rowStart,
                          rowEnd: selection.rowEnd,
                          start: selection.start,
                          length: width,
                        });
                      }}
                      className={`w-7 h-7 border cursor-pointer ${CELL_COLOR[val]} ${(() => {
                        const role = getCellRole(inst.id, t.stepIndex);
                        if (role === "source") return "border-cyan-300 ring-2 ring-cyan-300/40";
                        if (role === "generated") return "border-neutral-600 opacity-70";
                        if (role === "selected") return "border-cyan-300 ring-2 ring-cyan-300/30";
                        return "border-neutral-800";
                      })()}`}
                    />
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Notation({grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes, dottedNotes}) {
  const VF = Vex.Flow;
  const ref = useRef(null);

  useEffect(() => {
  const Flow = Vex.Flow;

    const attachDot = (note) => {
      // VexFlow API differs between versions. Prefer the modern Dot helper if available.
      if (note && typeof note.addDotToAll === "function") {
        note.addDotToAll();
        return;
      }
      if (Flow.Dot && typeof Flow.Dot.buildAndAttach === "function") {
        Flow.Dot.buildAndAttach([note], { all: true });
        return;
      }
      // Fallback: attach a Dot modifier to each key.
      try {
        const keys = note.getKeys ? note.getKeys() : note.keys || [];
        for (let i = 0; i < keys.length; i++) {
          note.addModifier(new Flow.Dot(), i);
        }
      } catch (e) {
        // ignore
      }
    }

    const applyGhostStyling = (note, ghostKeyIndices) => {
      if (!note || !ghostKeyIndices || ghostKeyIndices.length === 0) return;

      try {
        const Parenthesis = Flow.Parenthesis || VF.Parenthesis;
        const ModifierPosition = Flow.ModifierPosition || VF.ModifierPosition;
        if (Parenthesis && ModifierPosition && typeof note.addModifier === "function") {
          ghostKeyIndices.forEach((i) => {
            try {
              note.addModifier(new Parenthesis(ModifierPosition.LEFT), i);
              note.addModifier(new Parenthesis(ModifierPosition.RIGHT), i);
            } catch (_) {}
          });
        }
      } catch (_) {}

      // Try to shrink only the ghosted noteheads.
      ghostKeyIndices.forEach((i) => {
        try {
          const nh = note.note_heads?.[i] || note.noteHeads?.[i];
          if (nh && typeof nh.setScale === "function") nh.setScale(0.7, 0.7);
        } catch (_) {}
      });
    };
;

    if (!ref.current) return;
    ref.current.innerHTML = "";

      // Beam grouping per bar (used for beaming and dotted-note limits)
      const beamGroupsPerBar = (() => {
        // Compound meters like 6/8, 9/8, 12/8: group in dotted quarters (3 eighths)
        if (timeSig.d === 8 && timeSig.n % 3 === 0 && timeSig.n > 3) return timeSig.n / 3;
        // Simple meters: group by beats in the numerator (e.g., 4/4 -> 4, 3/4 -> 3)
        return timeSig.n;
      })();
    
    // Compute steps per beat from the current grid resolution.
    const stepsPerBeatBase = stepsPerBar / timeSig.n;

    // Prefer the simplest readable notation: if we're on a 32nd grid but no hits use odd 32nd positions,
    // engrave as 16ths to avoid unnecessary 32nd rests (keeps dotted/rest spelling stable).
    const canDownsample32to16 = false;

    const notationFactor = 1;
    const notationResolution = resolution;
    const stepsPerBeatN = stepsPerBeatBase;
    const stepsPerBarN = stepsPerBar;

    const notationGrid = grid;


    
    const calcBarWidth = () => {
      // Give dense measures (e.g., 16ths with explicit rests) more horizontal room
      // so VexFlow doesn't squeeze glyphs into overlaps/cutoffs.
      const dense32 = notationResolution === 32 && !mergeRests;
      const dense16 = notationResolution === 16 && !mergeRests;
      const dense8 = notationResolution === 8 && !mergeRests;

      // Per-step spacing in pixels
      const perStep =
        dense32 ? 24 :
        dense16 ? 22 :
        dense8 ? 20 :
        notationResolution === 32 ? 14 :
        notationResolution === 16 ? 16 :
        notationResolution === 8 ? 18 :
        34; // quarters

      // Base padding per bar (clef/time sig consume extra room on the first bar)
      const base = 90;

      const min = 240;
      return Math.max(min, Math.round(base + stepsPerBarN * perStep));
    };

    const barWidth = calcBarWidth();

    const perLine = Math.max(1, Math.min(bars, Number(barsPerLine) || 1));
    const rows = Math.ceil(bars / perLine);
    const systemHeight = 160;
    const height = 60 + rows * systemHeight;
    const width = 20 + perLine * barWidth;

    const renderer = new Renderer(ref.current, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const dur = notationResolution === 4 ? "q" : notationResolution === 8 ? "8" : notationResolution === 16 ? "16" : "32";

    const staves = [];
    const voices = [];
    const allBeams = [];

    for (let b = 0; b < bars; b++) {
      const row = Math.floor(b / perLine);
      const col = b % perLine;
      const x = 10 + col * barWidth;
      const y = 30 + row * systemHeight;
      const stave = new Stave(x, y, barWidth);

      // Remove repeated left barline so bars connect visually
      if (col > 0) stave.setBegBarType(Barline.type.NONE);

      if (b === 0) {
        stave.addClef("percussion");
        stave.addTimeSignature(`${timeSig.n}/${timeSig.d}`);
      }

      stave.setContext(ctx).draw();
      staves.push(stave);

      const notes = [];
      const noteStarts = [];
      const pushNote = (n, ghostKeyIndices) => { applyGhostStyling(n, ghostKeyIndices); notes.push(n); noteStarts.push(s); };

      let s = 0;
      while (s < stepsPerBar) {
        const globalIdx = b * stepsPerBar + s;

        const keys = [];
        const ghostKeyIndices = [];

        INSTRUMENTS.forEach((inst) => {
          const val = grid[inst.id][globalIdx];
          if (val !== CELL.OFF) {
            keys.push(NOTATION_MAP[inst.id].key);
            if (val === CELL.GHOST && GHOST_NOTATION_ENABLED.has(inst.id)) {
              ghostKeyIndices.push(keys.length - 1);
            }
          }
        });
const isRest = keys.length === 0;

        // Merge notes/rests to larger durations (optional)
        const stepsPerBeatN = Math.max(1, Math.round(notationResolution / timeSig.d));
        const subInBeat = stepsPerBeatN === 0 ? 0 : (s % stepsPerBeatN);

        const hasAnyHitAt = (absIdx) => {
      for (const inst of INSTRUMENTS) {
        if ((notationGrid[inst.id]?.[absIdx] ?? CELL.OFF) !== CELL.OFF) return true;
      }
      return false;
    };

        const isStepEmpty = (absIdx) => !hasAnyHitAt(absIdx);

        const allowDotted = dottedNotes && ("all" === "all" || notationResolution > 8);
        // Dotted notes should not cross the "beam group" divisions of the bar.
        // Example: in 4/4, don't dot across quarter-note beats; in 6/8, don't dot across the 3+3 grouping.
        const beamGroupsPerBar = (() => {
          // Compound meters like 6/8, 9/8, 12/8: group in dotted quarters (3 eighths)
          if (timeSig.d === 8 && timeSig.n % 3 === 0 && timeSig.n > 3) return timeSig.n / 3;
          // Simple meters: group by beats in the numerator (e.g., 4/4 -> 4, 3/4 -> 3)
          return timeSig.n;
        })();
        const groupSizeSteps = stepsPerBar / beamGroupsPerBar;
        const inSameBeamGroup = (startStep, endExclusiveStep) => {
          const last = endExclusiveStep - 1;
          return Math.floor(startStep / groupSizeSteps) === Math.floor(last / groupSizeSteps);
        };


        // --- Merge NOTES ---
        if (mergeNotes && !isRest) {
          // 8ths in x/4: beat is a quarter, pattern: [hit][empty] -> quarter note
          if (notationResolution === 8 && stepsPerBeatN === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              const noteQ = new StaveNote({ keys, duration: "q", clef: "percussion" });
              noteQ.setStemDirection(1);
              pushNote(noteQ, ghostKeyIndices);
                if (allowDotted && mergeNotes) {
                  const after = b * stepsPerBarN + (s + 2);
                  if (s + 2 < stepsPerBar && isStepEmpty(after) && inSameBeamGroup(s, s + 3)) {
                    attachDot(noteQ);
                    s += 3;
                    continue;
                  }
                }
                s += 2;
                continue;
            }
          }

          // 16ths:
          // - In x/4 (stepsPerBeatN=4):
          //   * [hit][empty][empty][empty] at beat start -> quarter note
          //   * [hit][empty] at 8th boundaries (sub 0 or 2) -> eighth note
          if (notationResolution === 16 && stepsPerBeatN === 4) {
            if (subInBeat === 0 && s + 3 < stepsPerBar) {
              const a = b * stepsPerBarN + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                const noteQ = new StaveNote({ keys, duration: "q", clef: "percussion" });
                noteQ.setStemDirection(1);
                pushNote(noteQ, ghostKeyIndices);
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
                note8.setStemDirection(1);
                pushNote(note8, ghostKeyIndices);
                if (allowDotted && mergeNotes) {
                  const after = b * stepsPerBarN + (s + 2);
                  if (s + 2 < stepsPerBar && isStepEmpty(after) && inSameBeamGroup(s, s + 3)) {
                    attachDot(note8);
                    s += 3;
                    continue;
                  }
                }
                s += 2;
                continue;
              }
            }
          }

          
          // 32nds:
          // - In x/4 (stepsPerBeatN=8):
          //   * [hit][empty x7] at beat start -> quarter note
          //   * [hit][empty x3] at 8th boundaries (sub 0 or 4) -> eighth note
          //   * [hit][empty] at 16th boundaries (sub 0,2,4,6) -> 16th note
          if (notationResolution === 32 && (stepsPerBeatN === 8 || stepsPerBeatN === 4)) {
            // 32nd-grid per-hit downsampling (32 -> 16 -> 8 -> 4) based on silence to the right.
            // This keeps bar math correct and prefers the longest simple value to minimize rests.
            const abs = b * stepsPerBarN + s;

            // Choose longest power-of-two length (in 32nd steps) that:
            // 1) starts aligned (s % len === 0),
            // 2) has no hits in the covered window (excluding the first step),
            // 3) does not cross the current beam group division.
            const canLen = (len) => {
              if (s % len !== 0) return false;
              if (s + (len - 1) >= stepsPerBarN) return false;
              if (!inSameBeamGroup(s, s + len)) return false;
              for (let k = 1; k < len; k++) {
                if (!isStepEmpty(abs + k)) return false;
              }
              return true;
            };

            let len = 1;
            if (canLen(2)) len = 2;
            if (canLen(4)) len = 4;
            if (canLen(8)) len = 8;

            // Optional dotted extension (adds half the base length), only if it fits in-group and is silent.
            // dotted 16th: 2+1=3, dotted 8th: 4+2=6, dotted quarter: 8+4=12
            let dotted = false;
            if (allowDotted && len >= 2) {
              const extra = len / 2;
              if (s + (len + extra - 1) < stepsPerBarN && inSameBeamGroup(s, s + len + extra)) {
                let ok = true;
                for (let k = len; k < len + extra; k++) {
                  if (!isStepEmpty(abs + k)) { ok = false; break; }
                }
                if (ok) dotted = true;
              }
            }

            const dur =
              len === 8 ? "q" :
              len === 4 ? "8" :
              len === 2 ? "16" :
              "32";

            const note = new StaveNote({ keys, duration: dur, clef: "percussion" });
            note.setStemDirection(1);
            if (dotted) attachDot(note);
            pushNote(note, ghostKeyIndices);

            s += dotted ? (len + len / 2) : len;
            continue;
          }


          // 32nds in x/8 (stepsPerBeatN=4):
          //   * [hit][empty x3] at beat start -> eighth note
          //   * [hit][empty] at 16th boundaries (sub 0 or 2) -> 16th note
          


// 16ths in x/8 (stepsPerBeatN=2): [hit][empty] -> eighth note (beat unit)
          if (notationResolution === 16 && stepsPerBeatN === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
              note8.setStemDirection(1);
              pushNote(note8, ghostKeyIndices);
                if (allowDotted && mergeNotes) {
                  const after = b * stepsPerBarN + (s + 2);
                  if (s + 2 < stepsPerBar && isStepEmpty(after) && inSameBeamGroup(s, s + 3)) {
                    attachDot(note8);
                    s += 3;
                    continue;
                  }
                }
                s += 2;
                continue;
            }
          }
        }

        // --- Merge RESTS ---
        if (mergeRests && isRest) {
          // 8ths in x/4: [rest][rest] at beat start -> quarter rest
          if (notationResolution === 8 && stepsPerBeatN === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              pushNote(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "percussion" }));
              s += 2;
              continue;
            }
          }

          // 16ths in x/4:
          //  * [rest][rest][rest][rest] at beat start -> quarter rest
          //  * [rest][rest] at 8th boundaries (sub 0 or 2) -> eighth rest
          if (notationResolution === 16 && stepsPerBeatN === 4) {
            if (subInBeat === 0 && s + 3 < stepsPerBar) {
              const a = b * stepsPerBarN + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "percussion" }));
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
                s += 2;
                continue;
              }
            }
          }

          
          // 32nds in x/4 (stepsPerBeatN=8):
          //  * [rest x8] at beat start -> quarter rest
          //  * [rest x4] at 8th boundaries (sub 0 or 4) -> eighth rest
          //  * [rest x2] at 16th boundaries (sub 0,2,4,6) -> 16th rest
          if (notationResolution === 32 && stepsPerBeatN === 8) {
            if (subInBeat === 0 && s + 7 < stepsPerBar) {
              const empties = Array.from({ length: 7 }, (_, i) => b * stepsPerBar + (s + 1 + i));
              if (empties.every(isStepEmpty)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "percussion" }));
                s += 8;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 4) && s + 3 < stepsPerBar) {
              const a = b * stepsPerBarN + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2 || subInBeat === 4 || subInBeat === 6) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "16r", clef: "percussion" }));
                s += 2;
                continue;
              }
            }
          }

          // 32nds in x/8 (stepsPerBeatN=4):
          //  * [rest x4] -> eighth rest
          //  * [rest x2] -> 16th rest
          if (notationResolution === 32 && stepsPerBeatN === 4) {
            if (subInBeat === 0 && s + 3 < stepsPerBar) {
              const a = b * stepsPerBarN + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                pushNote(new StaveNote({ keys: ["b/4"], duration: "16r", clef: "percussion" }));
                s += 2;
                continue;
              }
            }
          }


// 16ths in x/8 (stepsPerBeatN=2): [rest][rest] -> eighth rest
          if (notationResolution === 16 && stepsPerBeatN === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              pushNote(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
              s += 2;
              continue;
            }
          }
        }

        if (isRest) {
          pushNote(new StaveNote({ keys: ["b/4"], duration: dur + "r", clef: "percussion" }));
          s += 1;
          continue;
        }

        const note = new StaveNote({ keys, duration: dur, clef: "percussion" });
        // Force stems (and therefore beams) upwards
        note.setStemDirection(1);

        // MVP: if any cymbal is present in this slice, use X noteheads for the chord.
        // Next upgrade: per-key notehead types.

        pushNote(note, ghostKeyIndices);
        s += 1;
      }

      const voice = new Voice({ num_beats: timeSig.n, beat_value: timeSig.d });
      voice.setMode(Voice.Mode.SOFT);
      voice.addTickables(notes);
      voices.push(voice);

      // Beaming groups
      let groups;
      if (timeSig.n === 6 && timeSig.d === 8) {
        // Typical 6/8: 3+3 grouping
        groups = [new Fraction(3, 8)];
      } else {
        // Beam by beat unit
        groups = [new Fraction(1, timeSig.d)];
      }

      // Safety: enforce stem up on all non-rest notes before beaming
      notes.forEach((n) => {
        try {
          if (typeof n.isRest === "function" ? !n.isRest() : !String(n.getDuration?.() ?? "").includes("r")) {
            n.setStemDirection?.(1);
          }
        } catch (e) {}
      });

      // Generate beams *within* each beam group division only (never across groups).
      // This prevents later beats from affecting earlier beaming (e.g., dotted 8th + 16th in beat 1).
      const groupBuckets = Array.from({ length: beamGroupsPerBar }, () => []);
            const groupSizeSteps = stepsPerBar / beamGroupsPerBar;
for (let i = 0; i < notes.length; i++) {
        const st = noteStarts[i] ?? CELL.OFF;
        const g = Math.max(0, Math.min(beamGroupsPerBar - 1, Math.floor(st / groupSizeSteps)));
        groupBuckets[g].push(notes[i]);
      }
      groupBuckets.forEach((bucket) => {
        if (!bucket.length) return;
        const beams = Beam.generateBeams(bucket, { groups, stem_direction: 1, beam_rests: false });
        allBeams.push(...beams);
      });
    }

    // Format and draw each bar independently (format to stave so barlines stay correct)
    for (let b = 0; b < bars; b++) {
      const formatter = new Formatter().joinVoices([voices[b]]);
      formatter.formatToStave([voices[b]], staves[b]);
      voices[b].draw(ctx, staves[b]);
    }

    // Draw beams last for clarity
    allBeams.forEach((beam) => beam.setContext(ctx).draw());


    // White notation on dark UI
    const svg = ref.current.querySelector("svg");
    if (svg) {
      svg.style.background = "transparent";
      svg.querySelectorAll("path, line, rect, circle").forEach((el) => {
        el.setAttribute("stroke", "white");
        el.setAttribute("fill", "white");
      });
      svg.querySelectorAll("text").forEach((el) => {
        el.setAttribute("fill", "white");
      });
    }
  }, [grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes, dottedNotes]);

  return <div ref={ref} />;

}