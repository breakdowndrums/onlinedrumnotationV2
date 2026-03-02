import React, { useEffect, useRef, useState } from "react";
import { exportNotationPdf } from "./utils/exportNotationPdf";
import { usePlayback } from "./audio/usePlayback";
import * as Vex from "vexflow";

// VexFlow API
const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Fraction, Barline } = Vex.Flow;

// ====================
// INSTRUMENT SET (MVP+)
// ====================

const ALL_INSTRUMENTS = [
  { id: "splash", label: "Splash", midi: 55 },
  { id: "china", label: "China", midi: 52 },
  { id: "crash2", label: "Crash 2", midi: 57 },
  { id: "crash1", label: "Crash 1", midi: 49 },
  { id: "ride", label: "Ride", midi: 51 },
  { id: "rideBell", label: "Ride Bell", midi: 53 },

  { id: "hihatOpen", label: "HH Open", midi: 46 },
  { id: "hihat", label: "Hi-Hat", midi: 42 },
  { id: "hihatFoot", label: "HH Foot", midi: 44 },

  { id: "cowbell", label: "Cowbell", midi: 56 },

  { id: "tom1", label: "Tom 1", midi: 48 },
  { id: "tom2", label: "Tom 2", midi: 45 },
  { id: "floorTom", label: "Floor Tom", midi: 41 },

  { id: "sideStick", label: "Sidestick", midi: 37 },
  { id: "snare", label: "Snare", midi: 38 },
  { id: "kick", label: "Kick", midi: 36 }
];

const INSTRUMENT_BY_ID = Object.fromEntries(ALL_INSTRUMENTS.map((i) => [i.id, i]));

const DRUMKIT_PRESETS = {
  standard: ["crash2", "crash1", "ride", "hihatFoot", "tom1", "tom2", "floorTom", "hihat", "snare", "kick"],
  full: [
    "splash",
    "cowbell",
    "china",
    "crash2",
    "crash1",
    "rideBell",
    "ride",
    "hihatFoot",
    "tom1",
    "tom2",
    "floorTom",
    "hihatOpen",
    "hihat",
    "sideStick",
    "snare",
    "kick",
  ],
};


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
  sideStick: { key: "c/5/x2", x: true },

  // Cymbals / hats use X noteheads
  hihat: { key: "g/5/x2", x: true },
  hihatOpen: { key: "g/5/x3", x: true, open: true },
  hihatFoot: { key: "d/4/x2", x: true },
  ride: { key: "f/5/x2", x: true },
  rideBell: { key: "f/5/d2", diamond: true },
  crash1: { key: "a/5/x2", x: true },
  crash2: { key: "b/5/x2", x: true },
  china: { key: "a/5/x3", x: true },
  splash: { key: "c/6/x2", x: true },
  cowbell: { key: "e/5/t2", triangle: true },

  // Toms
  tom2: { key: "d/5" },
  tom1: { key: "e/5" },
  floorTom: { key: "a/4" },
};

export default function App() {
  const [kitInstrumentIds, setKitInstrumentIds] = useState(DRUMKIT_PRESETS.standard);
  const instruments = React.useMemo(
    () => kitInstrumentIds.map((id) => INSTRUMENT_BY_ID[id]).filter(Boolean),
    [kitInstrumentIds]
  );
  const [isKitEditorOpen, setIsKitEditorOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null); // { instId, moveTargetId }
  const [pendingPresetChange, setPendingPresetChange] = useState(null); // { presetName, targetIds, removedWithNotes }
  const [presetChangeWarningEnabled, setPresetChangeWarningEnabled] = useState(false);
  const [draggingKitId, setDraggingKitId] = useState(null);
  const transparentDragImageRef = React.useRef(null);
  const [customPresetIds, setCustomPresetIds] = useState(null);
  const availableInstrumentButtonWidthCh = React.useMemo(
    () => Math.max(...ALL_INSTRUMENTS.map((inst) => inst.label.length)) + 2,
    []
  );

  const [resolution, setResolution] = useState(8); // 4, 8, 16, 32
  const [bars, setBars] = useState(2);
  const [barsPerLine, setBarsPerLine] = useState(4);
  const [gridBarsPerLine, setGridBarsPerLine] = useState(4);
  const [layout, setLayout] = useState("grid-top");
  const [activeTab, setActiveTab] = useState("timing"); // grid-right | grid-top | notation-right | notation-top
  const [timeSig, setTimeSig] = useState({ n: 4, d: 4 });
  const [keepTiming, setKeepTiming] = useState(true);

  const [bpm, setBpm] = useState(120);
  const [bpmDraft, setBpmDraft] = useState("120");

  useEffect(() => {
    setBpmDraft(String(bpm));
  }, [bpm]);

  const clampBpm = (n) => Math.min(400, Math.max(20, n));
  const stepBpm = (delta) => setBpm((v) => clampBpm(v + delta));

  const bpmRepeatRef = React.useRef({ timer: null, interval: null });
  const stopBpmRepeat = React.useCallback(() => {
    const r = bpmRepeatRef.current;
    if (r.timer) window.clearTimeout(r.timer);
    if (r.interval) window.clearInterval(r.interval);
    r.timer = null;
    r.interval = null;
  }, []);
  const startBpmRepeat = React.useCallback(
    (delta) => {
      stopBpmRepeat();
      stepBpm(delta); // immediate step
      bpmRepeatRef.current.timer = window.setTimeout(() => {
        bpmRepeatRef.current.interval = window.setInterval(() => stepBpm(delta), 50);
      }, 130);
    },
    [stopBpmRepeat]
  );


  const [selection, setSelection] = useState(null);
  const [selectionFinalized, setSelectionFinalized] = useState(0);


  
  const selectionCellCount = selection
    ? (Math.max(0, (selection.endExclusive ?? 0) - (selection.start ?? 0)) *
       Math.max(1, (selection.rowEnd ?? selection.rowStart ?? 0) - (selection.rowStart ?? 0) + 1))
    : 0;
  const canClearSelection = selectionCellCount >= 2;
  const canLoopSelection = selectionCellCount >= 2;
// Keyboard shortcut: Backspace/Delete clears current selection (like Clear button)

  // Used to apply loop rules only when the user finishes a selection gesture (prevents mid-drag activation).
  useEffect(() => {
    const handler = () => setSelectionFinalized((x) => x + 1);
    window.addEventListener("dg-selection-finalized", handler);
    return () => window.removeEventListener("dg-selection-finalized", handler);
  }, []);
useEffect(() => {
    const onKey = (e) => {
      if ((e.key === "Backspace" || e.key === "Delete") && selection) {
        if (e.pointerType !== "mouse") e.preventDefault();
        setBaseGridWithUndo((prev) => {
          const next = {};
          for (const instId of Object.keys(prev)) next[instId] = [...prev[instId]];
          const start = selection.start;
          const end = selection.endExclusive;
          for (let r = selection.rowStart; r <= selection.rowEnd; r++) {
            const instId = instruments[r]?.id;
            if (!instId) continue;
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
  }, [selection, instruments]);
 // { rowStart, rowEnd, start, endExclusive } (row indices into active instruments)
  const [loopRule, setLoopRule] = useState(null);

  
  // Whether new selections should auto-generate a loop.
  const [loopRepeats, setLoopRepeats] = useState("all"); // "off" | "all" | "1".."8"
  const lastNonAllLoopRepeats = React.useRef("1");
  React.useEffect(() => {
    // Remember the last non-"all" value so clicking the center can toggle all <-> last value.
    if (loopRepeats !== "all") lastNonAllLoopRepeats.current = loopRepeats;
  }, [loopRepeats]);

  const loopModeEnabled = loopRepeats !== "off";

// If selection collapses to a single cell while looping is active, drop the loop.
  useEffect(() => {
    if (!loopRule) return;
    const width = selection ? (selection.endExclusive - selection.start) : 0;
    if (width < 2) {
      setLoopRule(null);
    }
  }, [selection, loopRule]);
  // When looping is enabled, apply/refresh the loop rule ONLY after a selection gesture finishes.
  // (Selection changes during drag shouldn't activate looping mid-drag.)
  useEffect(() => {
    if (!loopModeEnabled) return;
    if (!selection) return;

    const width = selection.endExclusive - selection.start;
    if (width < 2) return;

    setLoopRule((prev) => {
      const next = {
        rowStart: selection.rowStart,
        rowEnd: selection.rowEnd,
        start: selection.start,
        length: width,
      };
      if (
        prev &&
        prev.rowStart === next.rowStart &&
        prev.rowEnd === next.rowEnd &&
        prev.start === next.start &&
        prev.length === next.length
      ) {
        return prev;
      }
      return next;
    });
  }, [loopModeEnabled, selectionFinalized]);
useEffect(() => {
    if (loopModeEnabled) return;
    if (loopRule) setLoopRule(null);
  }, [loopModeEnabled, loopRule]);
// { rowStart, rowEnd, start, length }
  const [mergeRests, setMergeRests] = useState(true);
  const [mergeNotes, setMergeNotes] = useState(true);
  const [dottedNotes, setDottedNotes] = useState(true);
  const [flatBeams, setFlatBeams] = useState(true);
// "fast" (>=16ths) | "all"

  const stepsPerBar = Math.max(1, Math.round((timeSig.n * resolution) / timeSig.d));
  const columns = bars * stepsPerBar;

  const clearAll = React.useCallback(() => {
    setBaseGridWithUndo(() => {
      const g = {};
      ALL_INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(CELL.OFF)));
      return g;
    });
    setSelection(null);
    setLoopRule(null);
  }, [columns]);

  const clearSelection = React.useCallback(() => {
    if (!selection || selectionCellCount < 2) return;
    setBaseGridWithUndo((prev) => {
      const next = {};
      ALL_INSTRUMENTS.forEach((i) => (next[i.id] = [...(prev[i.id] || [])]));
      for (let r = selection.rowStart; r <= selection.rowEnd; r++) {
        const instId = instruments[r]?.id;
        if (!instId) continue;
        for (let c = selection.start; c < selection.endExclusive; c++) {
          next[instId][c] = CELL.OFF;
        }
      }
      return next;
    });
    setSelection(null);
  }, [selection, selectionCellCount, instruments]);




  const computeStepsPerBar = (ts, res) => Math.max(1, Math.round((ts.n * res) / ts.d));

  const remapGrid = (prevGrid, oldStepsPerBar, newStepsPerBar) => {
    const next = {};
    ALL_INSTRUMENTS.forEach((inst) => {
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
    setBaseGridWithUndo((prev) => remapGrid(prev, oldSPB, newSPB));
    setResolution(newRes);
  };

  const handleTimeSigChange = (newTS) => {
    if (!keepTiming) {
      setTimeSig(newTS);
      return;
    }
    const oldSPB = stepsPerBar;
    const newSPB = computeStepsPerBar(newTS, resolution);
    setBaseGridWithUndo((prev) => remapGrid(prev, oldSPB, newSPB));
    setTimeSig(newTS);
  };



  const [baseGrid, setBaseGrid] = useState(() => {
    const g = {};
    ALL_INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(CELL.OFF)));
    return g;
  });

  
  // Grid-only undo/redo (minimal): tracks baseGrid snapshots only.
  const [gridPast, setGridPast] = useState([]);
  const [gridFuture, setGridFuture] = useState([]);

  const gridPastRef = React.useRef([]);
  const gridFutureRef = React.useRef([]);
  const baseGridRef = React.useRef(null);

  React.useEffect(() => {
    baseGridRef.current = baseGrid;
  }, [baseGrid]);

  const snapshotGrid = React.useCallback((g) => {
    const snap = {};
    ALL_INSTRUMENTS.forEach((i) => {
      snap[i.id] = [...(g?.[i.id] || [])];
    });
    return snap;
  }, []);

  const syncHistoryState = React.useCallback(() => {
    setGridPast([...gridPastRef.current]);
    setGridFuture([...gridFutureRef.current]);
  }, []);

  const pushGridHistory = React.useCallback(() => {
    gridPastRef.current = [...gridPastRef.current, snapshotGrid(baseGridRef.current)];
    // clear redo stack on new edit
    gridFutureRef.current = [];
    // optional cap to keep memory bounded
    if (gridPastRef.current.length > 200) {
      gridPastRef.current = gridPastRef.current.slice(gridPastRef.current.length - 200);
    }
    syncHistoryState();
  }, [snapshotGrid, syncHistoryState]);

  const undoGrid = React.useCallback(() => {
    if (gridPastRef.current.length === 0) return;
    const prev = gridPastRef.current[gridPastRef.current.length - 1];
    gridPastRef.current = gridPastRef.current.slice(0, -1);
    gridFutureRef.current = [snapshotGrid(baseGridRef.current), ...gridFutureRef.current];
    setBaseGrid(prev);
    syncHistoryState();
  }, [snapshotGrid, syncHistoryState]);

  const redoGrid = React.useCallback(() => {
    if (gridFutureRef.current.length === 0) return;
    const next = gridFutureRef.current[0];
    gridFutureRef.current = gridFutureRef.current.slice(1);
    gridPastRef.current = [...gridPastRef.current, snapshotGrid(baseGridRef.current)];
    setBaseGrid(next);
    syncHistoryState();
  }, [snapshotGrid, syncHistoryState]);

  const setBaseGridWithUndo = React.useCallback(
    (updater) => {
      pushGridHistory();
      setBaseGrid(updater);
    },
    [pushGridHistory]
  );

  const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  const selectedPreset =
    arraysEqual(kitInstrumentIds, DRUMKIT_PRESETS.standard)
      ? "standard"
      : arraysEqual(kitInstrumentIds, DRUMKIT_PRESETS.full)
        ? "full"
        : "custom";

  const clearSelectionAndLoop = React.useCallback(() => {
    setSelection(null);
    setLoopRule(null);
  }, []);

  const applyKitIds = React.useCallback(
    (nextIds) => {
      const deduped = [...new Set(nextIds)].filter((id) => INSTRUMENT_BY_ID[id]);
      if (deduped.length === 0) return;
      setKitInstrumentIds(deduped);
      setPendingRemoval(null);
      setPendingPresetChange(null);
      clearSelectionAndLoop();
    },
    [clearSelectionAndLoop]
  );

  const applyCustomKitIds = React.useCallback(
    (nextIds) => {
      const deduped = [...new Set(nextIds)].filter((id) => INSTRUMENT_BY_ID[id]);
      if (deduped.length === 0) return;
      setCustomPresetIds(deduped);
      applyKitIds(deduped);
    },
    [applyKitIds]
  );

  const hasNotesOnTrack = React.useCallback(
    (instId) => (baseGrid[instId] || []).some((v) => v !== CELL.OFF),
    [baseGrid]
  );

  const computePresetTransition = React.useCallback(
    (presetName) => {
      const targetIds = DRUMKIT_PRESETS[presetName];
      if (!targetIds) return null;

      const removedIds = kitInstrumentIds.filter((id) => !targetIds.includes(id));
      const removedWithNotes = removedIds.filter((id) => hasNotesOnTrack(id));
      const removedSet = new Set(
        kitInstrumentIds.filter(
          (id) => !targetIds.includes(id) && !removedWithNotes.includes(id)
        )
      );
      const mergedKeepNoted = kitInstrumentIds.filter((id) => !removedSet.has(id));
      targetIds.forEach((id) => {
        if (!mergedKeepNoted.includes(id)) mergedKeepNoted.push(id);
      });

      return { targetIds, removedWithNotes, mergedKeepNoted };
    },
    [kitInstrumentIds, hasNotesOnTrack]
  );

  const requestPresetChange = React.useCallback(
    (presetName) => {
      const transition = computePresetTransition(presetName);
      if (!transition) return;
      const { targetIds, removedWithNotes, mergedKeepNoted } = transition;

      if (removedWithNotes.length === 0) {
        applyKitIds(targetIds);
        return;
      }

      if (!presetChangeWarningEnabled) {
        // Default behavior: automatically keep tracks with notes.
        applyCustomKitIds(mergedKeepNoted);
        return;
      }

      setPendingPresetChange({ presetName, targetIds, removedWithNotes });
    },
    [computePresetTransition, applyKitIds, applyCustomKitIds, presetChangeWarningEnabled]
  );

  const confirmPresetKeepNotedTracks = React.useCallback(() => {
    if (!pendingPresetChange) return;
    const removedSet = new Set(
      kitInstrumentIds.filter(
        (id) =>
          !pendingPresetChange.targetIds.includes(id) &&
          !pendingPresetChange.removedWithNotes.includes(id)
      )
    );

    // Preserve current order: remove only empty tracks.
    const merged = kitInstrumentIds.filter((id) => !removedSet.has(id));

    // Add missing target preset tracks at the end (in preset order).
    pendingPresetChange.targetIds.forEach((id) => {
      if (!merged.includes(id)) merged.push(id);
    });

    applyCustomKitIds(merged);
  }, [pendingPresetChange, kitInstrumentIds, applyCustomKitIds]);

  const confirmPresetDeleteAnyway = React.useCallback(() => {
    if (!pendingPresetChange) return;
    applyKitIds(pendingPresetChange.targetIds);
  }, [pendingPresetChange, applyKitIds]);

  useEffect(() => {
    if (!pendingPresetChange) return;
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        confirmPresetKeepNotedTracks();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingPresetChange(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingPresetChange, confirmPresetKeepNotedTracks]);

  useEffect(() => {
    if (!isKitEditorOpen) return;
    if (pendingPresetChange) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsKitEditorOpen(false);
      setPendingRemoval(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isKitEditorOpen, pendingPresetChange]);

  const hasSavedCustomPreset =
    !!customPresetIds &&
    !arraysEqual(customPresetIds, DRUMKIT_PRESETS.standard) &&
    !arraysEqual(customPresetIds, DRUMKIT_PRESETS.full);

  const presetOrder = hasSavedCustomPreset ? ["standard", "full", "custom"] : ["standard", "full"];
  const stepPreset = React.useCallback(
    (delta) => {
      const i = presetOrder.indexOf(selectedPreset);
      if (i === -1) {
        const fallback = delta >= 0 ? "full" : "standard";
        requestPresetChange(fallback);
        return;
      }

      const dir = delta >= 0 ? 1 : -1;
      for (let step = 1; step <= presetOrder.length; step++) {
        const next = presetOrder[(i + dir * step + presetOrder.length) % presetOrder.length];
        if (next === "custom" && customPresetIds) {
          if (!arraysEqual(customPresetIds, kitInstrumentIds)) {
            applyKitIds(customPresetIds);
            return;
          }
          continue;
        }
        if (next === "standard" || next === "full") {
          if (!presetChangeWarningEnabled) {
            const transition = computePresetTransition(next);
            if (!transition) continue;
            const preview =
              transition.removedWithNotes.length > 0 ? transition.mergedKeepNoted : transition.targetIds;
            if (arraysEqual(preview, kitInstrumentIds)) continue;
          }
          requestPresetChange(next);
          return;
        }
      }
    },
    [
      selectedPreset,
      applyKitIds,
      presetOrder,
      customPresetIds,
      requestPresetChange,
      computePresetTransition,
      presetChangeWarningEnabled,
      kitInstrumentIds,
    ]
  );

  const requestRemoveInstrument = React.useCallback(
    (instId) => {
      if (!kitInstrumentIds.includes(instId)) return;
      if (!hasNotesOnTrack(instId)) {
        applyCustomKitIds(kitInstrumentIds.filter((id) => id !== instId));
        return;
      }
      const moveTargetId = kitInstrumentIds.find((id) => id !== instId) || null;
      setPendingRemoval({ instId, moveTargetId });
    },
    [kitInstrumentIds, hasNotesOnTrack, applyCustomKitIds]
  );

  const confirmRemoveDeleteNotes = React.useCallback(() => {
    if (!pendingRemoval?.instId) return;
    const instId = pendingRemoval.instId;
    setBaseGridWithUndo((prev) => ({
      ...prev,
      [instId]: Array(columns).fill(CELL.OFF),
    }));
    applyCustomKitIds(kitInstrumentIds.filter((id) => id !== instId));
  }, [pendingRemoval, columns, setBaseGridWithUndo, applyCustomKitIds, kitInstrumentIds]);

  const confirmRemoveMoveNotes = React.useCallback(() => {
    if (!pendingRemoval?.instId || !pendingRemoval?.moveTargetId) return;
    const srcId = pendingRemoval.instId;
    const dstId = pendingRemoval.moveTargetId;
    if (srcId === dstId) return;

    setBaseGridWithUndo((prev) => {
      const next = { ...prev };
      const src = [...(prev[srcId] || Array(columns).fill(CELL.OFF))];
      const dst = [...(prev[dstId] || Array(columns).fill(CELL.OFF))];
      const rank = (v) => (v === CELL.ON ? 2 : v === CELL.GHOST ? 1 : 0);
      for (let c = 0; c < columns; c++) {
        const from = src[c] ?? CELL.OFF;
        if (from === CELL.OFF) continue;
        const to = dst[c] ?? CELL.OFF;
        dst[c] = rank(from) >= rank(to) ? from : to;
        src[c] = CELL.OFF;
      }
      next[srcId] = src;
      next[dstId] = dst;
      return next;
    });

    applyCustomKitIds(kitInstrumentIds.filter((id) => id !== srcId));
  }, [pendingRemoval, setBaseGridWithUndo, columns, applyCustomKitIds, kitInstrumentIds]);

  const toggleInstrumentInKit = React.useCallback(
    (instId, enable) => {
      if (enable) {
        if (kitInstrumentIds.includes(instId)) return;
        const fullOrder = DRUMKIT_PRESETS.full;
        const newFullIdx = fullOrder.indexOf(instId);
        if (newFullIdx === -1) {
          applyCustomKitIds([...kitInstrumentIds, instId]);
          return;
        }

        // Insert in the position implied by the full preset ordering.
        let insertAt = kitInstrumentIds.length;

        // Prefer placing above the first existing instrument below it in full-order.
        for (let i = newFullIdx + 1; i < fullOrder.length; i++) {
          const anchorId = fullOrder[i];
          const idx = kitInstrumentIds.indexOf(anchorId);
          if (idx !== -1) {
            insertAt = idx;
            break;
          }
        }

        // If no lower anchor exists, place below the nearest upper anchor.
        if (insertAt === kitInstrumentIds.length) {
          for (let i = newFullIdx - 1; i >= 0; i--) {
            const anchorId = fullOrder[i];
            const idx = kitInstrumentIds.indexOf(anchorId);
            if (idx !== -1) {
              insertAt = idx + 1;
              break;
            }
          }
        }

        const next = [...kitInstrumentIds];
        next.splice(insertAt, 0, instId);
        applyCustomKitIds(next);
        return;
      }
      requestRemoveInstrument(instId);
    },
    [kitInstrumentIds, applyCustomKitIds, requestRemoveInstrument]
  );

  const moveInstrument = React.useCallback(
    (instId, dir) => {
      const idx = kitInstrumentIds.indexOf(instId);
      if (idx < 0) return;
      const to = idx + dir;
      if (to < 0 || to >= kitInstrumentIds.length) return;
      const next = [...kitInstrumentIds];
      [next[idx], next[to]] = [next[to], next[idx]];
      applyCustomKitIds(next);
    },
    [kitInstrumentIds, applyCustomKitIds]
  );

  const moveInstrumentBefore = React.useCallback(
    (dragId, targetId) => {
      if (!dragId || !targetId || dragId === targetId) return;
      const from = kitInstrumentIds.indexOf(dragId);
      const to = kitInstrumentIds.indexOf(targetId);
      if (from < 0 || to < 0) return;
      // Already immediately before target -> no-op.
      if (from < to && from === to - 1) return;
      const next = [...kitInstrumentIds];
      next.splice(from, 1);
      const insertAt = next.indexOf(targetId);
      next.splice(insertAt, 0, dragId);
      applyCustomKitIds(next);
    },
    [kitInstrumentIds, applyCustomKitIds]
  );

  const getTransparentDragImage = React.useCallback(() => {
    if (transparentDragImageRef.current) return transparentDragImageRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    transparentDragImageRef.current = canvas;
    return canvas;
  }, []);


  const bakeLoopInto = (prevGrid, rule, repeats = "all") => {
    const next = {};
    ALL_INSTRUMENTS.forEach((inst) => (next[inst.id] = [...(prevGrid[inst.id] || [])]));

    const { rowStart, rowEnd, start, length } = rule;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = instruments[r]?.id;
      if (!instId) continue;
      srcByRow[instId] = next[instId].slice(start, start + length);
    }

    // Repeat the loop pattern after the selected region.
    // repeats: "all" or 1..8 (number of repeats after the original selection)
    const maxRepeats =
      repeats === "off"
        ? 0
        : repeats === "all"
          ? Infinity
          : Math.max(1, Math.min(8, Number(repeats) || 1));
    const endExclusive =
      maxRepeats === 0
        ? Math.min(columns, start + length)
        : maxRepeats === Infinity
          ? columns
          : Math.min(columns, start + length * (1 + maxRepeats));

    for (let idx = start + length; idx < endExclusive; idx++) {
      const i = (idx - start) % length;
      for (let r = rowStart; r <= rowEnd; r++) {
        const instId = instruments[r]?.id;
        if (!instId) continue;
        next[instId][idx] = srcByRow[instId]?.[i] ?? CELL.OFF;
      }
    }
    return next;
  };

    const computedGrid = React.useMemo(() => {
    const g = {};
    instruments.forEach((inst) => (g[inst.id] = [...(baseGrid[inst.id] || [])]));

    if (!loopRule || loopRule.length < 2) return g;

    const { rowStart, rowEnd, start, length } = loopRule;
    const srcByRow = {};
    for (let r = rowStart; r <= rowEnd; r++) {
      const instId = instruments[r]?.id;
      if (!instId) continue;
      srcByRow[instId] = (baseGrid[instId] || []).slice(start, start + length);
    }

    const maxRepeats =
      loopRepeats === "off"
        ? 0
        : loopRepeats === "all"
          ? Infinity
          : Math.max(1, Math.min(8, Number(loopRepeats) || 1));

    // Repeat the loop pattern starting right after the selected region.
    // If maxRepeats is finite, only apply that many repeats (1..8).
    let repeatsApplied = 0;
    if (maxRepeats === 0) return g;

    for (let idx = start + length; idx < columns; idx++) {
      const repeatIndex = Math.floor((idx - start) / length) - 0; // 1 for first repeat
      if (repeatIndex > 0) {
        if (repeatIndex > maxRepeats) break;
        // Only count when we enter a new repeat block
        // (repeatIndex is 1..)
      }

      const currentRepeat = Math.floor((idx - start) / length);
      if (currentRepeat >= 1 && currentRepeat > maxRepeats) break;

      const i = (idx - start) % length;
      for (let r = rowStart; r <= rowEnd; r++) {
        const instId = instruments[r]?.id;
        if (!instId) continue;
        g[instId][idx] = srcByRow[instId]?.[i] ?? CELL.OFF;
      }
    }
    return g;
  }, [baseGrid, loopRule, columns, loopRepeats, instruments]);


  const playback = usePlayback({
    instruments,
    grid: computedGrid,
    columns,
    bpm,
    resolution,
  });

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

      if (e.pointerType !== "mouse") e.preventDefault();
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
    setBaseGridWithUndo((prev) => {
      const next = {};
      ALL_INSTRUMENTS.forEach((i) => {
        next[i.id] = Array(columns)
          .fill(CELL.OFF)
          .map((_, idx) => prev[i.id]?.[idx] ?? CELL.OFF);
      });
      return next;
    });
  }, [columns]);

  
  
  
  const cycleVelocity = (inst, idx) => {
    if (loopRule) {
      const r = instruments.findIndex((x) => x.id === inst);
      const inLoopRows = r >= loopRule.rowStart && r <= loopRule.rowEnd;
      const inSourceCols = idx >= loopRule.start && idx < loopRule.start + loopRule.length;
      const inSource = inLoopRows && inSourceCols;

      const inGenerated = inLoopRows && idx >= loopRule.start + loopRule.length;

      // Rule:
      // - Click inside source: edit source live (no bake)
      // - Click anywhere else (including generated area): bake loop and exit loop mode (NO toggle on this click)
      if (!inSource || inGenerated) {
        setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    // Normal edit (or edit within loop source)
    setBaseGridWithUndo((prev) => {
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
      const r = instruments.findIndex((x) => x.id === inst);
      const inLoopRows = r >= loopRule.rowStart && r <= loopRule.rowEnd;
      const inSourceCols = idx >= loopRule.start && idx < loopRule.start + loopRule.length;
      const inSource = inLoopRows && inSourceCols;
      const inGenerated = inLoopRows && idx >= loopRule.start + loopRule.length;

      // Match click behavior: long-pressing outside the source bakes & exits without toggling.
      if (!inSource || inGenerated) {
        setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    setBaseGridWithUndo((prev) => {
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
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "timing"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              timing
            </button>
            <button
              onClick={() => setActiveTab((t) => (t === "notation" ? "timing" : "notation"))}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "notation"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              notation
            </button>
            <button
              onClick={() => setActiveTab((t) => (t === "selection" ? "timing" : "selection"))}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "selection"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >looping</button>
            <button
              type="button"
              onClick={undoGrid}
              disabled={gridPast.length === 0}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 ${
                gridPast.length === 0 ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title="Undo (grid only)"
            >
              ←
            </button>
            <button
              type="button"
              onClick={redoGrid}
              disabled={gridFuture.length === 0}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 ${
                gridFuture.length === 0 ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title="Redo (grid only)"
            >
              →
            </button>
            <button
              type="button"
              onClick={() => {
                if (canClearSelection) clearSelection();
                else clearAll();
              }}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
                canClearSelection
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
              title={canClearSelection ? "Clear selection" : "Clear all notes"}
              aria-label={canClearSelection ? "Clear selection" : "Clear all notes"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 16 16"
                className="h-4 w-4 text-white"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z" />
                <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z" />
              </svg>
            </button>
          </div>


          
          <div className="flex items-center gap-2 ml-auto" data-loopui='1'>
            <button
              type="button"
              onClick={async () => {
                try {
                  await exportNotationPdf(notationExportRef.current, { title: "Drum Notation" });
                } catch (e) {
                  console.error(e);
                  alert(e?.message || "Failed to export PDF");
                }
              }}
              className="touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 capitalize"
              title="Print the current notation"
            >
              print
            </button>

            <button
              onClick={togglePlaybackFromBeginning}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
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
                  onPointerDown={() => startBpmRepeat(-1)}
                  onPointerUp={stopBpmRepeat}
                  onPointerCancel={stopBpmRepeat}
                  onPointerLeave={stopBpmRepeat}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Decrease BPM"
                >
                  −
                </button>

                <input
                  type="number"
                  inputMode="numeric"
                  min={20}
                  max={400}
                  value={bpmDraft}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.target.select()}
                  onChange={(e) => {
                    const v = e.target.value;
                    setBpmDraft(v);
                    if (v === "") return;
                    const n = Number(v);
                    // Allow partial typing (e.g. "3" -> "33" -> "333") without snapping to min.
                    // Only live-update BPM when the typed number is already in-range.
                    if (Number.isFinite(n)) {
                      const rounded = Math.round(n);
                      if (rounded >= 20 && rounded <= 400) setBpm(rounded);
                    }
                  }}
                  onBlur={() => {
                    if (bpmDraft === "") {
                      setBpmDraft(String(bpm));
                      return;
                    }
                    const n = Number(bpmDraft);
                    if (!Number.isFinite(n)) {
                      setBpmDraft(String(bpm));
                      return;
                    }
                    const clamped = clampBpm(Math.round(n));
                    setBpm(clamped);
                    setBpmDraft(String(clamped));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="w-[70px] px-3 py-1 text-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 outline-none appearance-none no-spinner"
                  aria-label="BPM"
                />

                <button
                  type="button"
                  onPointerDown={() => startBpmRepeat(1)}
                  onPointerUp={stopBpmRepeat}
                  onPointerCancel={stopBpmRepeat}
                  onPointerLeave={stopBpmRepeat}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Increase BPM"
                >
                  +
                </button>
              </div>
            </div>

            <button
              onClick={() => setActiveTab((t) => (t === "layout" ? "timing" : "layout"))}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
                activeTab === "layout"
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
            >
              layout
            </button>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Drumkit</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => stepPreset(-1)}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Previous preset"
                >
                  −
                </button>
                <div
                  onClick={() => setIsKitEditorOpen(true)}
                  className="min-w-[88px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 capitalize cursor-pointer hover:bg-neutral-700/60"
                  title="Open drumkit editor"
                >
                  {selectedPreset}
                </div>
                <button
                  type="button"
                  onClick={() => stepPreset(1)}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Next preset"
                >
                  +
                </button>
              </div>
            </div>
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
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
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
            

            

            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Looping</span>

              <div className={`flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800 ${!canLoopSelection ? "opacity-40" : ""}`}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // match other steppers: single step on click, rapid after 130ms hold
                    e.preventDefault();
                    const order = ["all", "off", "1", "2", "3", "4", "5", "6", "7", "8"];
                    const stepOnce = () => {
                      setLoopRepeats((prev) => {
                        const i = Math.max(0, order.indexOf(String(prev)));
                        return order[(i - 1 + order.length) % order.length];
                      });
                    };
                    stepOnce();
                    let interval = null;
                    let timeout = window.setTimeout(() => {
                      interval = window.setInterval(stepOnce, 160);
                    }, 130);
                    const stop = () => {
                      if (timeout) window.clearTimeout(timeout);
                      timeout = null;
                      if (interval) window.clearInterval(interval);
                      interval = null;
                      window.removeEventListener("mouseup", stop);
                      window.removeEventListener("touchend", stop);
                      window.removeEventListener("touchcancel", stop);
                    };
                    window.addEventListener("mouseup", stop);
                    window.addEventListener("touchend", stop, { passive: true });
                    window.addEventListener("touchcancel", stop, { passive: true });
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  title="Decrease loop repeats"
                >
                  –
                </button>

                <div
                  onClick={() => {
                    setLoopRepeats((prev) => {
                      if (prev === "all") {
                        return lastNonAllLoopRepeats.current || "1";
                      }
                      return "all";
                    });
                  }}
                  className="min-w-[44px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 cursor-pointer hover:bg-neutral-700/60 border-l border-r border-neutral-700 capitalize"
                  title="How many times the selection repeats"
                >
                  {loopRepeats}
                </div>

                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    const order = ["all", "off", "1", "2", "3", "4", "5", "6", "7", "8"];
                    const stepOnce = () => {
                      setLoopRepeats((prev) => {
                        const i = Math.max(0, order.indexOf(String(prev)));
                        return order[(i + 1) % order.length];
                      });
                    };
                    stepOnce();
                    let interval = null;
                    let timeout = window.setTimeout(() => {
                      interval = window.setInterval(stepOnce, 160);
                    }, 130);
                    const stop = () => {
                      if (timeout) window.clearTimeout(timeout);
                      timeout = null;
                      if (interval) window.clearInterval(interval);
                      interval = null;
                      window.removeEventListener("mouseup", stop);
                      window.removeEventListener("touchend", stop);
                      window.removeEventListener("touchcancel", stop);
                    };
                    window.addEventListener("mouseup", stop);
                    window.addEventListener("touchend", stop, { passive: true });
                    window.addEventListener("touchcancel", stop, { passive: true });
                  }}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  title="Increase loop repeats"
                >
                  +
                </button>
              </div>
            </div>

<button
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => {
if (!loopRule) return;
                setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats));
                setLoopRule(null);
                setSelection(null);
              }}
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
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
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
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
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
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
                className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
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
              type="button"
              onClick={() => setFlatBeams((v) => !v)}
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                flatBeams
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Render beams horizontally (no tilt)"
            >
              Flat beams
            </button>


            

          </div>
        )}
      </header>


      
      
      <main
        className={`touch-none select-none mt-6 ${
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
                instruments={instruments}
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
                dottedNotes={dottedNotes}
                flatBeams={flatBeams}
              />
            </div>

            <div className="w-full overflow-x-auto">
              <div className="inline-block align-top">
                <Grid
                instruments={instruments}
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
                loopRepeats={loopRepeats}
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
                instruments={instruments}
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
                loopRepeats={loopRepeats}
                setLoopRule={setLoopRule}
                playhead={playback.playhead}
              />
            </div>
            </div>

            <div className="w-full" ref={setNotationExportEl}>
              <Notation
                instruments={instruments}
                grid={computedGrid}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
                dottedNotes={dottedNotes}
                flatBeams={flatBeams}
              />
            </div>
          </>
        )}
      </main>

      {isKitEditorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => {
            setIsKitEditorOpen(false);
            setPendingRemoval(null);
          }}
        >
          <div
            className="w-full max-w-[27rem] max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Edit Drumkit</h2>
              <button
                type="button"
                onClick={() => {
                  setIsKitEditorOpen(false);
                  setPendingRemoval(null);
                }}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-neutral-300">Preset</span>
              <select
                value={selectedPreset}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "custom" && customPresetIds) applyKitIds(customPresetIds);
                  if (value === "standard") requestPresetChange("standard");
                  if (value === "full") requestPresetChange("full");
                }}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                {hasSavedCustomPreset && <option value="custom">Custom</option>}
                <option value="standard">Standard</option>
                <option value="full">Full</option>
              </select>
              <button
                type="button"
                onClick={() => setPresetChangeWarningEnabled((v) => !v)}
                className={`ml-3 px-2.5 py-1 rounded border text-sm ${
                  presetChangeWarningEnabled
                    ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 hover:bg-neutral-800/40"
                }`}
                title="Toggle preset change warning"
              >
                Preset Change Warning
              </button>
            </div>

            {pendingRemoval && (
              <div className="mt-4 rounded-lg border border-amber-700/70 bg-amber-950/30 p-3">
                <div className="text-sm text-amber-200">
                  {(INSTRUMENT_BY_ID[pendingRemoval.instId]?.label || pendingRemoval.instId) +
                    " has notes. Remove it by deleting notes, or move notes to another track."}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={confirmRemoveDeleteNotes}
                    className="px-3 py-1.5 rounded border border-amber-600 text-sm text-amber-100 hover:bg-amber-800/40"
                  >
                    Delete notes and remove
                  </button>
                  <select
                    value={pendingRemoval.moveTargetId || ""}
                    onChange={(e) =>
                      setPendingRemoval((prev) =>
                        prev ? { ...prev, moveTargetId: e.target.value || null } : prev
                      )
                    }
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                  >
                    <option value="">Select destination</option>
                    {kitInstrumentIds
                      .filter((id) => id !== pendingRemoval.instId)
                      .map((id) => (
                        <option key={`move-${id}`} value={id}>
                          {INSTRUMENT_BY_ID[id]?.label || id}
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    disabled={!pendingRemoval.moveTargetId}
                    onClick={confirmRemoveMoveNotes}
                    className={`px-3 py-1.5 rounded border text-sm ${
                      pendingRemoval.moveTargetId
                        ? "border-cyan-600 text-cyan-100 hover:bg-cyan-800/30"
                        : "border-neutral-700 text-neutral-500 cursor-not-allowed"
                    }`}
                  >
                    Move notes and remove
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingRemoval(null)}
                    className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-1 md:grid-cols-[1.35fr_0.65fr] gap-1">
              <div>
                <div className="text-sm font-medium mb-2">Kit Order</div>
                <div className="text-xs text-neutral-400 mb-2">Drag rows to reorder instruments.</div>
                <div className="space-y-2">
                  {kitInstrumentIds.map((id, idx) => {
                    const inst = INSTRUMENT_BY_ID[id];
                    if (!inst) return null;
                    return (
                      <div
                        key={`kit-${id}`}
                        draggable
                        onDragStart={(e) => {
                          setDraggingKitId(id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", id);
                          e.dataTransfer.setDragImage(getTransparentDragImage(), 0, 0);
                        }}
                        onDragEnd={() => setDraggingKitId(null)}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = "move";
                          const dragId = e.dataTransfer.getData("text/plain") || draggingKitId;
                          if (dragId && dragId !== id) moveInstrumentBefore(dragId, id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const dragId = e.dataTransfer.getData("text/plain") || draggingKitId;
                          moveInstrumentBefore(dragId, id);
                          setDraggingKitId(null);
                        }}
                        className={`flex items-center gap-1 rounded border px-1.5 py-1 ${
                          draggingKitId === id
                            ? "border-cyan-700/70 bg-cyan-950/20"
                            : "border-neutral-800"
                        }`}
                      >
                        <div className="w-3.5 text-[11px] text-neutral-400">{idx + 1}</div>
                        <div className="text-neutral-500 text-[9px]">⋮⋮</div>
                        <div className="flex-1 text-sm leading-tight pr-1">
                          {inst.label}
                        </div>
                        <button
                          type="button"
                          onClick={() => moveInstrument(id, -1)}
                          disabled={idx === 0}
                          className={`h-6 w-6 shrink-0 rounded border text-[11px] leading-none ${
                            idx === 0
                              ? "border-neutral-800 text-neutral-600 cursor-not-allowed"
                              : "border-neutral-700 text-neutral-200 hover:bg-neutral-800/60"
                          }`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveInstrument(id, 1)}
                          disabled={idx === kitInstrumentIds.length - 1}
                          className={`h-6 w-6 shrink-0 rounded border text-[11px] leading-none ${
                            idx === kitInstrumentIds.length - 1
                              ? "border-neutral-800 text-neutral-600 cursor-not-allowed"
                              : "border-neutral-700 text-neutral-200 hover:bg-neutral-800/60"
                          }`}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => requestRemoveInstrument(id)}
                          className="h-6 px-2 shrink-0 rounded border border-red-900 text-[10px] leading-none text-red-200 hover:bg-red-900/30"
                        >
                          remove
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <div
                  className="text-sm font-medium mb-2 ml-auto text-left"
                  style={{ width: `${availableInstrumentButtonWidthCh}ch` }}
                >
                  Available Instruments
                </div>
                <div className="space-y-2 flex flex-col items-end ml-auto">
                  {ALL_INSTRUMENTS.map((inst) => {
                    const enabled = kitInstrumentIds.includes(inst.id);
                    return (
                      <button
                        type="button"
                        onClick={() => toggleInstrumentInKit(inst.id, !enabled)}
                        key={`avail-${inst.id}`}
                        className={`w-full text-left inline-flex items-center gap-2 rounded border px-2 py-1 text-sm ${
                          enabled
                            ? "border-neutral-800 text-white hover:bg-neutral-800/40"
                            : "border-neutral-800 text-neutral-500 bg-neutral-900/40 hover:bg-neutral-800/50"
                        }`}
                        style={{ width: `${availableInstrumentButtonWidthCh}ch` }}
                      >
                        <span>{inst.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t border-neutral-800 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsKitEditorOpen(false);
                  setPendingRemoval(null);
                }}
                className="px-4 py-2 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPresetChange && (
        <div
          className="fixed inset-0 z-[80] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setPendingPresetChange(null)}
        >
          <div
            className="w-full max-w-xl rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Preset Change Warning</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Switching to <span className="capitalize">{pendingPresetChange.presetName}</span> would remove tracks that contain notes:
            </p>
            <div className="mt-2 text-sm text-amber-200">
              {pendingPresetChange.removedWithNotes
                .map((id) => INSTRUMENT_BY_ID[id]?.label || id)
                .join(", ")}
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              Default action keeps tracks that have notes and removes only empty tracks.
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmPresetKeepNotedTracks}
                className="px-3 py-1.5 rounded border border-cyan-600 text-sm text-cyan-100 hover:bg-cyan-800/30"
              >
                Keep tracks with notes (Default)
              </button>
              <button
                type="button"
                onClick={confirmPresetDeleteAnyway}
                className="px-3 py-1.5 rounded border border-red-700 text-sm text-red-100 hover:bg-red-900/30"
              >
                Delete anyway
              </button>
              <button
                type="button"
                onClick={() => setPendingPresetChange(null)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


function Grid({
  instruments,
  grid, columns, bars, stepsPerBar, resolution, timeSig, gridBarsPerLine,
  cycleVelocity, toggleGhost, selection, setSelection, loopRule,
    loopRepeats,
  setLoopRule, playhead
}) {

  const notifySelectionFinalized = React.useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("dg-selection-finalized"));
    } catch (_) {}
  }, []);
  const longPress = React.useRef({ timer: null, did: false });

  // Ensure pending long-press timers don't leak across clicks (desktop).
  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (longPress.current.timer) {
        window.clearTimeout(longPress.current.timer);
        longPress.current.timer = null;
      }
      // If a selection drag was in progress and the user released outside the grid,
      // we still need to end the drag so clicks work again.
      setDrag((d) => {
        if (d) {
          // finalize selection gesture
          try { notifySelectionFinalized(); } catch (_) {}
          return null;
        }
        return d;
      });
    };
    window.addEventListener("mouseup", onGlobalMouseUp);
    window.addEventListener("blur", onGlobalMouseUp);
    return () => {
      window.removeEventListener("mouseup", onGlobalMouseUp);
      window.removeEventListener("blur", onGlobalMouseUp);
    };
  }, []);

  // Desktop: allow long-press ghost on active cells, but if the user moves away while holding,
  // start a selection instead and revert the ghost toggle.
  useEffect(() => {
    const onMove = (e) => {
      if (!press.current.active) return;
      if (press.current.pointerId !== "mouse") return;

      // Only react while the mouse button is still held down.
      if ((e.buttons & 1) !== 1) return;

      // Require a small movement threshold to avoid accidental selection from small cursor drift.
      const dx = e.clientX - press.current.startX;
      const dy = e.clientY - press.current.startY;
      if (dx * dx + dy * dy < 36) return; // < 6px

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-gridcell='1']");
      if (!cell) return;

      const r1 = Number(cell.getAttribute("data-row"));
      const c1 = Number(cell.getAttribute("data-col"));
      if (Number.isNaN(r1) || Number.isNaN(c1)) return;

      const r0 = press.current.startRow;
      const c0 = press.current.startCol;

      if (r1 === r0 && c1 === c0) return;

      if (press.current.mode === "ghostArmed" || press.current.mode === "ghostDone") {
        if (longPress.current.timer) {
          window.clearTimeout(longPress.current.timer);
          longPress.current.timer = null;
        }
        if (press.current.mode === "ghostDone" && press.current.ghostToggled && press.current.instId) {
          try { toggleGhost(press.current.instId, c0); } catch (_) {}
        }
        longPress.current.did = false;
        press.current.active = false;
        press.current.pointerId = null;
        longPress.current.did = false;
        press.current.mode = "none";
        setDrag({ row: r0, col: c0 });
        press.current.didSelect = true;
        setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
      } else if (press.current.mode === "select") {
        setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
      }
    };

    const onUp = () => {
      if (!press.current.active) return;
      if (press.current.pointerId !== "mouse") return;

      if (longPress.current.timer) {
        window.clearTimeout(longPress.current.timer);
        longPress.current.timer = null;
      }

      // If we switched into selection mode while holding, finalize it on release.
      // This handler only runs for the special long-press/ghost path (active ghost-enabled cells).
      if (press.current.mode === "select" || press.current.didSelect) {
        setDrag(null);
        notifySelectionFinalized();
      }

      press.current.active = false;
      press.current.pointerId = null;
      press.current.mode = "none";
                        press.current.ghostToggled = false;
                        press.current.didSelect = false;
                        longPress.current.did = false;
      press.current.didSelect = false;
      press.current.instId = null;
      press.current.ghostToggled = false;
      press.current.didSelect = false;
      longPress.current.did = false;
      press.current.startX = 0;
      press.current.startY = 0;
      press.current.startTime = 0;
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [notifySelectionFinalized]);
  const press = React.useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    mode: "none", // none | ghostArmed | ghostDone | select
    startRow: 0,
    startCol: 0,
    instId: null,
    ghostToggled: false,
    didSelect: false,
  });
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
      const r = instruments.findIndex((x) => x.id === instId);
      if (r >= loopRule.rowStart && r <= loopRule.rowEnd) {
        const inSrc =
          stepIndex >= loopRule.start && stepIndex < loopRule.start + loopRule.length;
        if (inSrc) return "source";

        const maxRepeats =
          loopRepeats === "off"
            ? 0
            : loopRepeats === "all"
              ? Infinity
              : Math.max(1, Math.min(8, Number(loopRepeats) || 1));
        const loopEndExclusive =
          maxRepeats === Infinity
            ? columns
            : Math.min(columns, loopRule.start + loopRule.length * (1 + maxRepeats));

        if (maxRepeats !== 0) {
          if (
            stepIndex >= loopRule.start + loopRule.length &&
            stepIndex < loopEndExclusive
          )
            return "generated";
        }
      }
    }

    // Only show selection outline if it spans at least 2 cells
    if (selection) {
      const width = selection.endExclusive - selection.start;
      if (width >= 2) {
        const r = instruments.findIndex((x) => x.id === instId);
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
                        notifySelectionFinalized();
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

            {instruments.map((inst) => (
              <React.Fragment key={`${inst.id}-${lineIdx}`}>
                <div className="pr-2 text-xs text-right whitespace-nowrap select-none">{inst.label}</div>
                {timeline.map((t, i) => {
                  if (t.type === "gap") return <div key={`g-${inst.id}-${lineIdx}-${i}`} />;
                  const val = grid[inst.id]?.[t.stepIndex] ?? CELL.OFF;
                  return (
                    <div
                      key={`${inst.id}-${t.stepIndex}`}
                      data-gridcell="1"
                      data-row={instruments.findIndex((x) => x.id === inst.id)}
                      data-col={t.stepIndex}
                      onPointerDown={(e) => {
                        // Mobile/touch-only gesture handling.
                        if (e.pointerType === "mouse") return;

                        // Alternative loop/selection end: while holding a long-press (or ghost) gesture,
                        // tap another cell with a second finger to set the end of the region.
                        // This must also work when starting on an *active* ghost-enabled cell (snare/toms/hihat):
                        // if ghost already toggled, revert it before switching into selection.
                        if (
                          press.current.active &&
                          (press.current.mode === "select" || press.current.mode === "ghostArmed" || press.current.mode === "ghostDone") &&
                          press.current.pointerId !== e.pointerId
                        ) {
                          const el = e.target?.closest?.("[data-gridcell='1']");
                          if (el) {
                            const r1 = Number(el.getAttribute("data-row"));
                            const c1 = Number(el.getAttribute("data-col"));
                            const r0 = press.current.startRow;
                            const c0 = press.current.startCol;

                            // If we were arming/toggling a ghost note, cancel/revert that.
                            if (press.current.mode === "ghostArmed") {
                              if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                              longPress.current.timer = null;
                              longPress.current.did = false;
                            } else if (press.current.mode === "ghostDone") {
                              if (press.current.ghostToggled && press.current.instId) {
                                try { toggleGhost(press.current.instId, c0); } catch (_) {}
                              }
                              longPress.current.did = false;
                            }

                            const rowStart = Math.min(r0, r1);
                            const rowEnd = Math.max(r0, r1);
                            const start = Math.min(c0, c1);
                            const endExclusive = Math.max(c0, c1) + 1;

                            setSelection({ rowStart, rowEnd, start, endExclusive });
                            setDrag(null);
                            notifySelectionFinalized();
                          }

                          // end the hold gesture
                          press.current.active = false;
                          press.current.pointerId = null;
                          press.current.mode = "none";
                          press.current.ghostToggled = false;
                          if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                          longPress.current.timer = null;
                          return;
                        }
                        e.preventDefault();
                        e.stopPropagation();

                        const r = instruments.findIndex((x) => x.id === inst.id);
                        const c = t.stepIndex;

                        press.current.active = true;
                        press.current.pointerId = e.pointerId;
                        press.current.startX = e.clientX;
                        press.current.startY = e.clientY;
                        press.current.mode = "none";
                        press.current.ghostToggled = false;
      press.current.didSelect = false;
      longPress.current.did = false;
      press.current.startX = 0;
      press.current.startY = 0;
      press.current.startTime = 0;
                        press.current.startRow = r;
                        press.current.startCol = c;
                        press.current.instId = inst.id;

                        // Ghost long-press on active cells (ghost-enabled instruments)
                        if (val !== CELL.OFF && GHOST_ENABLED.has(inst.id)) {
                          press.current.mode = "ghostArmed";
                        }

                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.did = false;
                        longPress.current.timer = window.setTimeout(() => {
                          if (!press.current.active) return;

                          // Ghost takes priority if armed
                          if (press.current.mode === "ghostArmed") {
                            longPress.current.did = true;
                            toggleGhost(inst.id, c);
                            press.current.mode = "ghostDone";
                            press.current.ghostToggled = true;
                            return;
                          }

                          // Otherwise start selection mode
                          press.current.mode = "select";
                          longPress.current.did = true;
                          setDrag({ row: r, col: c });
                          setSelection({ rowStart: r, rowEnd: r, start: c, endExclusive: c + 1 });
                        }, 130);
                      }}
                      onPointerMove={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (!press.current.active) return;
                        if (press.current.pointerId !== e.pointerId) return;
                        e.preventDefault();


                        // If we long-pressed an active ghost-enabled cell and then move away,
                        // switch into selection mode and revert the ghost toggle.
                        const el0 = document.elementFromPoint(e.clientX, e.clientY);
                        const cell0 = el0?.closest?.("[data-gridcell='1']");
                        if (cell0) {
                          const r1 = Number(cell0.getAttribute("data-row"));
                          const c1 = Number(cell0.getAttribute("data-col"));
                          const r0 = press.current.startRow;
                          const c0 = press.current.startCol;

                          if (!Number.isNaN(r1) && !Number.isNaN(c1) && (r1 !== r0 || c1 !== c0)) {
                            if (press.current.mode === "ghostArmed") {
                              if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                              longPress.current.timer = null;
                              longPress.current.did = false;
                              press.current.active = false;
                              press.current.pointerId = null;
                              longPress.current.did = false;
                              press.current.mode = "none";
                              setDrag({ row: r0, col: c0 });
        press.current.didSelect = true;
                              setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
                            } else if (press.current.mode === "ghostDone") {
                              longPress.current.did = false;
                              if (press.current.ghostToggled && press.current.instId) {
                                try { toggleGhost(press.current.instId, c0); } catch (_) {}
                              }
                              press.current.active = false;
                              press.current.pointerId = null;
                              longPress.current.did = false;
                              press.current.mode = "none";
                              setDrag({ row: r0, col: c0 });
        press.current.didSelect = true;
                              setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
                            } else if (press.current.mode === "select") {
                              setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
                            }
                          }
                        }

                        // Only drag after selection mode has begun (after long-press).
                        if (press.current.mode !== "select") return;

                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        const cell = el?.closest?.("[data-gridcell='1']");
                        if (!cell) return;
                        const r1 = Number(cell.getAttribute("data-row"));
                        const c1 = Number(cell.getAttribute("data-col"));
                        if (Number.isNaN(r1) || Number.isNaN(c1)) return;

                        const r0 = press.current.startRow;
                        const c0 = press.current.startCol;

                        const rowStart = Math.min(r0, r1);
                        const rowEnd = Math.max(r0, r1);
                        const start = Math.min(c0, c1);
                        const endExclusive = Math.max(c0, c1) + 1;

                        setSelection({ rowStart, rowEnd, start, endExclusive });
                      }}
                      onPointerUp={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;

                        press.current.active = false;
                        press.current.pointerId = null;
                        setDrag(null);
                        notifySelectionFinalized();
                      }}
                      onPointerCancel={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;

                        press.current.active = false;
                        press.current.pointerId = null;
                        setDrag(null);
                        notifySelectionFinalized();
                      }}
                      onPointerLeave={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (longPress.current.timer) {
                          window.clearTimeout(longPress.current.timer);
                          longPress.current.timer = null;
                        }
                        // Suppress click toggle if a long-press fired (touch).
                        if (longPress.current.did) {
                          longPress.current.did = false;
                          return;
                        }
                        cycleVelocity(inst.id, t.stepIndex);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        if (loopRule) return;

                        const r = instruments.findIndex((x) => x.id === inst.id);
                        const c = t.stepIndex;

                        // Desktop long-press ghost toggle (130ms) on eligible active cells.
                        // If the user moves away while holding, we switch into selection mode and revert the ghost toggle.
                        const val = grid[inst.id][c];
                        const ghostAllowed = GHOST_ENABLED.has(inst.id);
                        if (ghostAllowed && (val === CELL.ON || val === CELL.GHOST)) {
                          press.current.active = true;
                          press.current.pointerId = "mouse";
                          press.current.startRow = r;
                          press.current.startCol = c;
                          press.current.startX = e.clientX;
                          press.current.startY = e.clientY;
                          press.current.startTime = Date.now();
                          press.current.instId = inst.id;
                          press.current.mode = "ghostArmed";
                          press.current.ghostToggled = false;
      press.current.didSelect = false;
      longPress.current.did = false;
      press.current.startX = 0;
      press.current.startY = 0;
      press.current.startTime = 0;

                          if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                          longPress.current.did = false;
                          longPress.current.timer = window.setTimeout(() => {
                            if (!press.current.active || press.current.pointerId !== "mouse") return;
                            if (press.current.mode !== "ghostArmed") return;
                            longPress.current.did = true;
                            toggleGhost(inst.id, c);
                            press.current.mode = "ghostDone";
                            press.current.ghostToggled = true;
                          }, 130);
                          return; // wait: either long-press becomes ghost, or movement turns into selection
                        }

                        // Default desktop behavior: click-drag to select
                        setDrag({ row: r, col: c });
                        setSelection({ rowStart: r, rowEnd: r, start: c, endExclusive: c + 1 });
                      }}
                      onMouseEnter={(e) => {
                        if (e && e.stopPropagation) e.stopPropagation();
                        if (loopRule) return;
                        if (!drag) return;
                        const r0 = drag.row;
                        const c0 = drag.col;
                        const r1 = instruments.findIndex((x) => x.id === inst.id);
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
                        notifySelectionFinalized();
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

function Notation({instruments, grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes, dottedNotes, flatBeams}) {
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

      // VexFlow beam grouping fraction (repeated across the bar).
      const beamGroupsFraction = (() => {
        if (timeSig.d === 8 && timeSig.n % 3 === 0 && timeSig.n > 3) return new Fraction(3, 8);
        return new Fraction(1, timeSig.d);
      })();
      const groups = [beamGroupsFraction];

    
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
    const beamsByBar = Array.from({ length: bars }, () => []);
    const beamBucketsByBar = Array.from({ length: bars }, () => []);

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
      const pushNote = (n, ghostKeyIndices, openHatKeyIndices) => {
        applyGhostStyling(n, ghostKeyIndices);
        // Hi-hat open: add open-circle articulation above the notehead.
        try {
          if (openHatKeyIndices && openHatKeyIndices.length) {
            const Articulation = Vex.Flow.Articulation;
            const ModifierPosition = Vex.Flow.Modifier.Position || Vex.Flow.ModifierPosition || Vex.Flow.Modifier?.Position;
            for (const idx of openHatKeyIndices) {
              const a = new Articulation("ah");
              if (ModifierPosition && typeof a.setPosition === "function") a.setPosition(ModifierPosition.ABOVE);
              if (typeof n.addModifier === "function") n.addModifier(a, idx);
            }
          }
        } catch (e) {}
        notes.push(n);
        noteStarts.push(s);
      };

      let s = 0;
      while (s < stepsPerBar) {
        const globalIdx = b * stepsPerBar + s;

        const keys = [];
        const ghostKeyIndices = [];
        const openHatKeyIndices = [];

        instruments.forEach((inst) => {
          const val = grid[inst.id][globalIdx];
          if (val !== CELL.OFF) {
            keys.push(NOTATION_MAP[inst.id].key);
            const keyIndex = keys.length - 1;
            if (NOTATION_MAP[inst.id]?.openCircle) {
              openHatKeyIndices.push(keyIndex);
            }
            if (val === CELL.GHOST && GHOST_NOTATION_ENABLED.has(inst.id)) {
              ghostKeyIndices.push(keyIndex);
            }
          }
        });
const isRest = keys.length === 0;

        // Merge notes/rests to larger durations (optional)
        const stepsPerBeatN = Math.max(1, Math.round(notationResolution / timeSig.d));
        const subInBeat = stepsPerBeatN === 0 ? 0 : (s % stepsPerBeatN);

        const hasAnyHitAt = (absIdx) => {
      for (const inst of instruments) {
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
              pushNote(noteQ, ghostKeyIndices, openHatKeyIndices);
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
                pushNote(noteQ, ghostKeyIndices, openHatKeyIndices);
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
                note8.setStemDirection(1);
                pushNote(note8, ghostKeyIndices, openHatKeyIndices);
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
            pushNote(note, ghostKeyIndices, openHatKeyIndices);

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
              pushNote(note8, ghostKeyIndices, openHatKeyIndices);
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

        pushNote(note, ghostKeyIndices, openHatKeyIndices);
        s += 1;
      }

      const voice = new Voice({ num_beats: timeSig.n, beat_value: timeSig.d });
      voice.setMode(Voice.Mode.SOFT);
      voice.addTickables(notes);
      voices.push(voice);

      // Beaming groups
      if (timeSig.n === 6 && timeSig.d === 8) {
        // Typical 6/8: 3+3 grouping
      } else {
        // Beam by beat unit
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
        const beams = Beam.generateBeams(bucket, { groups, stem_direction: 1, beam_rests: false, flat_beams: !!flatBeams });
        beamsByBar[b].push(...beams);
        // Store buckets so we can regenerate beams cleanly for bar-level alignment.
        beamBucketsByBar[b].push(bucket.slice());
      });
    }

    // Format and draw each bar independently (format to stave so barlines stay correct)
    for (let b = 0; b < bars; b++) {
      const formatter = new Formatter().joinVoices([voices[b]]);
      formatter.formatToStave([voices[b]], staves[b]);
      voices[b].draw(ctx, staves[b]);
    }

    // Draw beams last for clarity
    for (let b = 0; b < bars; b++) {
      let barBeams = beamsByBar[b] || [];
      if (flatBeams && barBeams.length) {
        // First pass: compute the highest beam Y in this bar.
        barBeams.forEach((beam) => {
          try { beam.postFormat?.(); } catch (_) {}
        });

        const ys = barBeams
          .map((beam) => {
            try { return beam.getBeamYToDraw?.(); } catch (_) { return null; }
          })
          .filter((y) => typeof y === "number");

        if (ys.length) {
          const targetY = Math.min(...ys);

          // Second pass: regenerate beams (fresh objects) and apply flat_beam_offset BEFORE final postFormat/draw.
          const fresh = [];
          const buckets = beamBucketsByBar[b] || [];

          buckets.forEach((bucket) => {
            if (!bucket.length) return;

            // Clear any previously associated beam metadata on notes (helps avoid drawing/geometry artifacts).
            bucket.forEach((n) => {
              try { n.setBeam?.(null); } catch (_) {}
            });

            const beams = Beam.generateBeams(bucket, { groups, stem_direction: 1, beam_rests: false, flat_beams: true });
            beams.forEach((beam) => {
              try {
                beam.setContext(ctx);
                // First postFormat to compute beam geometry for the current note layout.
                beam.postFormat?.();
                beam.applyStemExtensions?.();

                const currentY = beam.getBeamYToDraw?.();
                if (typeof currentY === "number") {
                  const delta = targetY - currentY;
                  beam.render_options.flat_beam_offset = (beam.render_options.flat_beam_offset ?? 0) + delta;
                }

                // Recompute after shifting the flat beam offset so stems match.
                beam.postFormat?.();
                beam.applyStemExtensions?.();
              } catch (_) {}
              fresh.push(beam);
            });
          });

          // Use regenerated beams for drawing (gives cleaner geometry).
          barBeams = fresh;
        }
      }

      barBeams.forEach((beam) => beam.setContext(ctx).draw());
    }



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
  }, [instruments, grid, resolution, bars, barsPerLine, stepsPerBar, timeSig, mergeRests, mergeNotes, dottedNotes, flatBeams]);

  return <div ref={ref} />;

}
