import React, { useEffect, useRef, useState } from "react";
import Vex from "vexflow";

// VexFlow API
const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Fraction, Barline } = Vex.Flow;

// ====================
// INSTRUMENT SET (MVP+)
// ====================
const INSTRUMENTS = [
  { id: "kick", label: "Kick", midi: 36 },
  { id: "snare", label: "Snare", midi: 38 },
  { id: "hihat", label: "Hi-Hat", midi: 42 },
  { id: "hihatFoot", label: "HH Foot", midi: 44 },
  { id: "tom2", label: "Tom 2", midi: 45 },
  { id: "tom1", label: "Tom 1", midi: 48 },
  { id: "floorTom", label: "Floor Tom", midi: 41 },
  { id: "ride", label: "Ride", midi: 51 },
  { id: "crash1", label: "Crash 1", midi: 49 },
  { id: "crash2", label: "Crash 2", midi: 57 },
];

const VELOCITY_CYCLE = [0, 100];

const VELOCITY_COLOR = {
  0: "bg-neutral-800",
  100: "bg-[#00b3ba]",
};

// NOTE: mapping is a starting point; we'll refine staff positions later.
const NOTATION_MAP = {
  kick: { key: "f/4" },
  snare: { key: "c/5" },

  // Cymbals / hats use X noteheads
  hihat: { key: "g/5/x2", x: true },
  hihatFoot: { key: "f/4/x2", x: true },
  ride: { key: "f/5/x2", x: true },
  crash1: { key: "a/5/x2", x: true },
  crash2: { key: "c/6/x2", x: true },

  // Toms
  tom2: { key: "a/4" },
  tom1: { key: "c/5" },
  floorTom: { key: "f/4" },
};

export default function App() {
  const [resolution, setResolution] = useState(8); // 4, 8, 16
  const [bars, setBars] = useState(2);
  const [barsPerLine, setBarsPerLine] = useState(4);
  const [gridBarsPerLine, setGridBarsPerLine] = useState(4);
  const [layout, setLayout] = useState("grid-top"); // grid-right | grid-top | notation-right | notation-top
  const [timeSig, setTimeSig] = useState({ n: 4, d: 4 });
  const [keepTiming, setKeepTiming] = useState(true);

  const [selection, setSelection] = useState(null); // { rowStart, rowEnd, start, endExclusive } (row indices into INSTRUMENTS)
  const [loopRule, setLoopRule] = useState(null);

  // If selection collapses to a single cell while looping is active, drop the loop.
  useEffect(() => {
    if (!loopRule) return;
    const width = selection ? (selection.endExclusive - selection.start) : 0;
    if (width < 2) {
      setLoopRule(null);
    }
  }, [selection, loopRule]);


  // Auto-enable looping after holding a valid selection for 200ms
  useEffect(() => {
    if (loopRule) return;
    if (!selection) return;
    const width = selection.endExclusive - selection.start;
    if (width < 2) return;

    const timer = setTimeout(() => {
      setLoopRule({
        rowStart: selection.rowStart,
        rowEnd: selection.rowEnd,
        start: selection.start,
        length: width,
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [selection, loopRule]);

 // { rowStart, rowEnd, start, length }
  const [mergeRests, setMergeRests] = useState(true);
  const [mergeNotes, setMergeNotes] = useState(true);

  const stepsPerBar = Math.max(1, Math.round((timeSig.n * resolution) / timeSig.d));
  const columns = bars * stepsPerBar;


  const computeStepsPerBar = (ts, res) => Math.max(1, Math.round((ts.n * res) / ts.d));

  const remapGrid = (prevGrid, oldStepsPerBar, newStepsPerBar) => {
    const next = {};
    INSTRUMENTS.forEach((inst) => {
      const out = Array(bars * newStepsPerBar).fill(0);
      for (let b = 0; b < bars; b++) {
        for (let s = 0; s < oldStepsPerBar; s++) {
          const oldGlobal = b * oldStepsPerBar + s;
          const val = prevGrid[inst.id]?.[oldGlobal] ?? 0;
          if (val === 0) continue;

          const newLocal = Math.round((s * newStepsPerBar) / oldStepsPerBar);
          const clamped = Math.min(newStepsPerBar - 1, Math.max(0, newLocal));
          const newGlobal = b * newStepsPerBar + clamped;

          out[newGlobal] = Math.max(out[newGlobal] ?? 0, val);
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
    INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(0)));
    return g;
  });


  const bakeLoopInto = (prevGrid, rule) => {
    const next = {};
    INSTRUMENTS.forEach((inst) => (next[inst.id] = [...(prevGrid[inst.id] || [])]));

    const { rowStart, rowEnd, start, length } = rule;
    const step = length;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = INSTRUMENTS[r].id;
      srcByRow[instId] = next[instId].slice(start, start + length);
    }

    for (let pos = start + step; pos + length <= columns; pos += step) {
      for (let i = 0; i < length; i++) {
        const idx = pos + i;
        for (let r = rowStart; r <= rowEnd; r++) {
          const instId = INSTRUMENTS[r].id;
          next[instId][idx] = (srcByRow[instId]?.[i] ?? 0);
        }
      }
    }
    return next;
  };

  const computedGrid = React.useMemo(() => {
    const g = {};
    INSTRUMENTS.forEach((inst) => (g[inst.id] = [...(baseGrid[inst.id] || [])]));

    if (!loopRule || loopRule.length < 2) return g;

    const { rowStart, rowEnd, start, length } = loopRule;
    const step = length;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = INSTRUMENTS[r].id;
      srcByRow[instId] = (baseGrid[instId] || []).slice(start, start + length);
    }

    for (let pos = start + step; pos + length <= columns; pos += step) {
      for (let i = 0; i < length; i++) {
        for (let r = rowStart; r <= rowEnd; r++) {
          const instId = INSTRUMENTS[r].id;
          g[instId][pos + i] = (srcByRow[instId]?.[i] ?? 0); // overwrite, including 0
        }
      }
    }
    return g;
  }, [baseGrid, loopRule, columns]);


  // Resize grid when resolution/bars change (preserve existing hits)
  useEffect(() => {
    setBaseGrid((prev) => {
      const next = {};
      INSTRUMENTS.forEach((i) => {
        next[i.id] = Array(columns)
          .fill(0)
          .map((_, idx) => prev[i.id]?.[idx] ?? 0);
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
      const nextVal =
        VELOCITY_CYCLE[(VELOCITY_CYCLE.indexOf(current) + 1) % VELOCITY_CYCLE.length];
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
      <header className="flex flex-wrap items-center gap-3" data-loopui='1'>
        <h1 className="text-lg font-semibold mr-4">Drum Grid → Notation</h1>

        <label className="text-sm text-neutral-300 flex items-center gap-2">
          Resolution
          <select
            value={resolution}
            onChange={(e) => handleResolutionChange(Number(e.target.value))}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          >
            <option value={4}>4th</option>
            <option value={8}>8th</option>
            <option value={16}>16th</option>
          </select>
        </label>

        <label className="text-sm text-neutral-300 flex items-center gap-2">
          <input
            type="checkbox"
            checked={keepTiming}
            onChange={(e) => setKeepTiming(e.target.checked)}
          />
          Keep timing
        </label>

        <label className="text-sm text-neutral-300 flex items-center gap-2">
          Time
          <select
            value={`${timeSig.n}/${timeSig.d}`}
            onChange={(e) => {
              const [n, d] = e.target.value.split("/").map(Number);
              handleTimeSigChange({ n, d });
            }}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          >
            <option value="4/4">4/4</option>
            <option value="3/4">3/4</option>
            <option value="6/8">6/8</option>
          </select>
        </label>

        <label className="text-sm text-neutral-300 flex items-center gap-2">
          Bars
          <input
            type="number"
            min={1}
            max={8}
            value={bars}
            onChange={(e) => setBars(Number(e.target.value))}
            className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          />
        </label>

        <button
          onClick={() => {
            // Toggle looping
            if (loopRule) {
              setLoopRule(null);
              setSelection(null);
              return;
            }
            if (!selection) return;
            const length = Math.max(1, selection.endExclusive - selection.start);
            if (length < 2) return;
            setLoopRule({ rowStart: selection.rowStart, rowEnd: selection.rowEnd, start: selection.start, length });
          }}
          disabled={(!loopRule && (!selection || (selection.endExclusive - selection.start) < 2))}
          className={`px-3 py-2 rounded border text-sm ${
            (!loopRule && (!selection || (selection.endExclusive - selection.start) < 2))
              ? "bg-neutral-900 border-neutral-800 text-neutral-600"
              : "bg-neutral-800 border-neutral-700"
          }`}
          title={loopRule ? "Turn looping off" : "Enable looping from the selected source region (min 2 cells wide)"}
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
          disabled={!loopRule}
          className={`px-3 py-2 rounded border text-sm ${loopRule ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-800 text-neutral-600"}`}
          title="Bake loop: commit repeated notes and remove the active loop"
        >
          Bake loop
        </button>

        <label className="text-sm text-neutral-300 flex items-center gap-2" data-loopui='1'>
          Bars/line
          <input
            type="number"
            min={1}
            max={bars}
            value={Math.min(bars, Math.max(1, barsPerLine))}
            onChange={(e) =>
              setBarsPerLine(Math.min(bars, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-20 bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          />
        </label>
        <label className="text-sm text-neutral-300 flex items-center gap-2" data-loopui='1'>
          <span className="whitespace-nowrap">Grid bars/line</span>
          <input
            type="number"
            min={1}
            max={bars}
            value={Math.min(bars, Math.max(1, gridBarsPerLine))}
            onChange={(e) =>
              setGridBarsPerLine(Math.min(bars, Math.max(1, Number(e.target.value) || 1)))
            }
            className="w-24 bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          />
        </label>

        <button
          onClick={() => setMergeRests((v) => !v)}
          className={`px-3 py-2 rounded border text-sm ${mergeRests ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-700"} `}
          title="Merge consecutive rests into larger rests"
        >
          Merge rests: {mergeRests ? "On" : "Off"}
        </button>

        <button
          onClick={() => setMergeNotes((v) => !v)}
          className={`px-3 py-2 rounded border text-sm ${mergeNotes ? "bg-neutral-800 border-neutral-700" : "bg-neutral-900 border-neutral-700"} `}
          title="Merge notes across empty subdivisions (e.g., 8ths on 1 and 2 become quarters when & is empty)"
        >
          Merge notes: {mergeNotes ? "On" : "Off"}
        </button>

        <div className="text-xs text-neutral-400 ml-auto">
          Click cell: Off → 100 → Off
        </div>
      
        <label className="text-sm text-neutral-300 flex items-center gap-2" data-loopui='1'>
          <span className="whitespace-nowrap">Layout</span>
          <select
            value={layout}
            onChange={(e) => setLayout(e.target.value)}
            className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1"
          >
            <option value="grid-right">Grid left / Notation right</option>
            <option value="grid-top">Grid top / Notation bottom</option>
            <option value="notation-right">Notation left / Grid right</option>
            <option value="notation-top">Notation top / Grid bottom</option>
          </select>
        </label>

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
            <div className="w-full">
              <Notation
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
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
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
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
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
              />
            </div>
            </div>

            <div className="w-full">
              <Notation
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
              />
            </div>
          </>
        )}
      </main>


    </div>
  );
}


function Grid({ grid, columns, bars, stepsPerBar, resolution, timeSig, gridBarsPerLine, cycleVelocity, selection, setSelection, loopRule }) {
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
          <div key={`gridline-${lineIdx}`} className="grid gap-1" onMouseUp={() => setDrag(null)} style={{ gridTemplateColumns: `auto repeat(${timeline.length}, 28px)` }}>
            <div />
            {timeline.map((t, i) => {
              if (t.type === "gap") return <div key={t.key} />;
              const label = labelFor(t.stepInBar);
              return (
                <div key={`h-${t.stepIndex}`} className="text-xs text-center text-neutral-400 select-none">
                  {label}
                </div>
              );
            })}

            {INSTRUMENTS.slice().reverse().map((inst) => (
              <React.Fragment key={`${inst.id}-${lineIdx}`}>
                <div className="pr-2 text-xs text-right whitespace-nowrap select-none">{inst.label}</div>
                {timeline.map((t, i) => {
                  if (t.type === "gap") return <div key={`g-${inst.id}-${lineIdx}-${i}`} />;
                  const val = grid[inst.id]?.[t.stepIndex] ?? 0;
                  return (
                    <div
                      key={`${inst.id}-${t.stepIndex}`}
                      data-gridcell="1"
                      onClick={(e) => {
                        e.stopPropagation();
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
                      onMouseUp={() => setDrag(null)}
                      className={`w-7 h-7 border cursor-pointer ${VELOCITY_COLOR[val]} ${(() => {
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

function Notation({ grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";

    const barWidth = 300;
    const perLine = Math.max(1, Math.min(bars, Number(barsPerLine) || 1));
    const rows = Math.ceil(bars / perLine);
    const systemHeight = 160;
    const height = 60 + rows * systemHeight;
    const width = 20 + perLine * barWidth;

    const renderer = new Renderer(ref.current, Renderer.Backends.SVG);
    renderer.resize(width, height);
    const ctx = renderer.getContext();

    const dur = resolution === 4 ? "q" : resolution === 8 ? "8" : "16";

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

      let s = 0;
      while (s < stepsPerBar) {
        const globalIdx = b * stepsPerBar + s;

        const keys = [];
        
        INSTRUMENTS.forEach((inst) => {
          const val = grid[inst.id][globalIdx];
          if (val !== 0) {
            keys.push(NOTATION_MAP[inst.id].key);
          }
        });

        const isRest = keys.length === 0;

        // Merge notes/rests to larger durations (optional)
        const stepsPerBeat = Math.max(1, Math.round(resolution / timeSig.d));
        const subInBeat = stepsPerBeat === 0 ? 0 : (s % stepsPerBeat);

        const hasAnyHitAt = (absIdx) => {
          for (const inst of INSTRUMENTS) {
            if (grid[inst.id][absIdx] !== 0) return true;
          }
          return false;
        };

        const isStepEmpty = (absIdx) => !hasAnyHitAt(absIdx);

        // --- Merge NOTES ---
        if (mergeNotes && !isRest) {
          // 8ths in x/4: beat is a quarter, pattern: [hit][empty] -> quarter note
          if (resolution === 8 && stepsPerBeat === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              const noteQ = new StaveNote({ keys, duration: "q", clef: "percussion" });
              noteQ.setStemDirection(1);
              notes.push(noteQ);
              s += 2;
              continue;
            }
          }

          // 16ths:
          // - In x/4 (stepsPerBeat=4):
          //   * [hit][empty][empty][empty] at beat start -> quarter note
          //   * [hit][empty] at 8th boundaries (sub 0 or 2) -> eighth note
          if (resolution === 16 && stepsPerBeat === 4) {
            if (subInBeat === 0 && s + 3 < stepsPerBar) {
              const a = b * stepsPerBar + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                const noteQ = new StaveNote({ keys, duration: "q", clef: "percussion" });
                noteQ.setStemDirection(1);
                notes.push(noteQ);
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
                note8.setStemDirection(1);
                notes.push(note8);
                s += 2;
                continue;
              }
            }
          }

          // 16ths in x/8 (stepsPerBeat=2): [hit][empty] -> eighth note (beat unit)
          if (resolution === 16 && stepsPerBeat === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
              note8.setStemDirection(1);
              notes.push(note8);
              s += 2;
              continue;
            }
          }
        }

        // --- Merge RESTS ---
        if (mergeRests && isRest) {
          // 8ths in x/4: [rest][rest] at beat start -> quarter rest
          if (resolution === 8 && stepsPerBeat === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              notes.push(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "percussion" }));
              s += 2;
              continue;
            }
          }

          // 16ths in x/4:
          //  * [rest][rest][rest][rest] at beat start -> quarter rest
          //  * [rest][rest] at 8th boundaries (sub 0 or 2) -> eighth rest
          if (resolution === 16 && stepsPerBeat === 4) {
            if (subInBeat === 0 && s + 3 < stepsPerBar) {
              const a = b * stepsPerBar + (s + 1);
              const b2 = b * stepsPerBar + (s + 2);
              const c = b * stepsPerBar + (s + 3);
              if (isStepEmpty(a) && isStepEmpty(b2) && isStepEmpty(c)) {
                notes.push(new StaveNote({ keys: ["b/4"], duration: "qr", clef: "percussion" }));
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                notes.push(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
                s += 2;
                continue;
              }
            }
          }

          // 16ths in x/8 (stepsPerBeat=2): [rest][rest] -> eighth rest
          if (resolution === 16 && stepsPerBeat === 2 && subInBeat === 0 && s + 1 < stepsPerBar) {
            if (isStepEmpty(b * stepsPerBar + (s + 1))) {
              notes.push(new StaveNote({ keys: ["b/4"], duration: "8r", clef: "percussion" }));
              s += 2;
              continue;
            }
          }
        }

        if (isRest) {
          notes.push(new StaveNote({ keys: ["b/4"], duration: dur + "r", clef: "percussion" }));
          s += 1;
          continue;
        }

        const note = new StaveNote({ keys, duration: dur, clef: "percussion" });
        // Force stems (and therefore beams) upwards
        note.setStemDirection(1);

        // MVP: if any cymbal is present in this slice, use X noteheads for the chord.
        // Next upgrade: per-key notehead types.

        notes.push(note);
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
        } catch {}
      });

      const beams = Beam.generateBeams(notes, { groups, stem_direction: 1 });
      allBeams.push(...beams);
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
  }, [grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes]);

  return <div ref={ref} />;

}
