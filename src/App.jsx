import React, { useEffect, useRef, useState } from "react";
import { exportNotationPdf } from "./utils/exportNotationPdf";
import { exportDrumMidi } from "./utils/exportMidi";
import { usePlayback } from "./audio/usePlayback";
import * as Vex from "vexflow";
import customSmuflFont from "./fonts/customSmuflFont.json";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

// VexFlow API
const { Renderer, Stave, StaveNote, Voice, Formatter, Beam, Fraction, Barline } = Vex.Flow;
const CUSTOM_MUSIC_FONT_NAME = "DrumGridCustomSmufl";
const CUSTOM_GHOST_GLYPHS = {
  black: "noteheadBlackParensCustom",
  x: "noteheadXBlackGhostSmallCustom",
  circleX: "noteheadXBlackGhostSmallCustom",
};
const CUSTOM_CIRCLED_X_LARGE_GLYPH = "noteheadCircleX115FreshCustom";

let customSmuflInstalled = false;

function ensureCustomSmuflFontInstalled() {
  if (customSmuflInstalled) return;
  try {
    const currentStack = (Vex.Flow.getMusicFont && Vex.Flow.getMusicFont()) || [];
    if (!currentStack.length) {
      Vex.Flow.setMusicFont("Bravura", "Gonville", "Custom");
    }
    Vex.Flow.Font.load(CUSTOM_MUSIC_FONT_NAME, customSmuflFont.data, customSmuflFont.metrics);
    const names = (Vex.Flow.getMusicFont && Vex.Flow.getMusicFont()) || ["Bravura", "Gonville", "Custom"];
    const nextStack = [CUSTOM_MUSIC_FONT_NAME, ...names.filter((n) => n !== CUSTOM_MUSIC_FONT_NAME)];
    Vex.Flow.setMusicFont(...nextStack);
    customSmuflInstalled = true;
  } catch (_) {
    // Keep existing music font stack if custom overlay fails.
  }
}

ensureCustomSmuflFontInstalled();

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
  ksh: ["hihat", "snare", "kick"],
};

const BUILTIN_PRESET_ORDER = ["standard", "full", "ksh"];
const PRESET_LABELS = {
  standard: "Standard",
  full: "Full",
  ksh: "Minimal",
};
const USER_PRESETS_STORAGE_KEY = "drum-grid-user-presets-v1";
const LOCAL_BEAT_LIBRARY_STORAGE_KEY = "drum-grid-local-beat-library-v1";
const PUBLIC_SUBMIT_COMPOSER_STORAGE_KEY = "drum-grid-public-submit-composer-v1";
const SONG_ARRANGEMENT_STORAGE_KEY = "drum-grid-song-arrangement-v1";
const SONG_ARRANGEMENT_LIBRARY_STORAGE_KEY = "drum-grid-song-arrangement-library-v1";
const ARRANGEMENT_BOUNDARY_COMP_SCALE_STORAGE_KEY = "drum-grid-arrangement-boundary-comp-scale-v1";
const ARRANGEMENT_ADAPTIVE_COMP_ENABLED_STORAGE_KEY = "drum-grid-arrangement-adaptive-comp-enabled-v1";
const LEGACY_SELECTION_ENABLED_STORAGE_KEY = "drum-grid-legacy-selection-enabled-v1";
const MOVE_MODE_DEBUG_ENABLED_STORAGE_KEY = "drum-grid-move-mode-debug-enabled-v1";
const STICKING_GUIDE_ENABLED_STORAGE_KEY = "drum-grid-sticking-guide-enabled-v1";
const STICKING_HANDEDNESS_STORAGE_KEY = "drum-grid-sticking-handedness-v1";
const STICKING_LEAD_HAND_STORAGE_KEY = "drum-grid-sticking-lead-hand-v1";
const STICKING_EDIT_MODE_ENABLED_STORAGE_KEY = "drum-grid-sticking-edit-mode-enabled-v1";
const STICKING_OVERRIDES_STORAGE_KEY = "drum-grid-sticking-overrides-v1";
const STICKING_KEEP_QUARTER_LEAD_HAND_STORAGE_KEY =
  "drum-grid-sticking-keep-quarter-lead-hand-v1";
const SHOW_EDITED_STICKING_STORAGE_KEY = "drum-grid-show-edited-sticking-v1";
const SHOW_NOTATION_STICKING_STORAGE_KEY = "drum-grid-show-notation-sticking-v1";
const NOTATION_STICKING_VIEW_STORAGE_KEY = "drum-grid-notation-sticking-view-v2";
const PREFERENCES_CATEGORY_STORAGE_KEY = "drum-grid-preferences-category-v1";
const BEAT_CATEGORY_OPTIONS = [
  "Groove",
  "Fill",
  "Intro",
  "Verse",
  "Chorus",
  "Bridge",
  "Outro",
  "Other",
];
const BEAT_STYLE_OPTIONS = ["Rock", "Funk", "Jazz", "Hiphop", "DnB", "Disco", "Latin & World"];


const CELL = {
  OFF: "off",
  ON: "on",
  GHOST: "ghost",
  ACCENT: "accent",
};

const GHOST_NOTATION_ENABLED = new Set(["snare", "tom1", "tom2", "floorTom", "hihat"]);

const CELL_CYCLE = [CELL.OFF, CELL.ON];
const MOVE_OVERLAP_MODES = [
  { id: "all-to-all", label: "All overwrites" },
  { id: "active-to-all", label: "Hits ovewrite" },
  { id: "active-to-empty", label: "Fill in gaps" },
];
const LIBRARY_SORT_MODES = [
  { id: "latest", label: "Upload date: newest" },
  { id: "oldest", label: "Upload date: oldest" },
  { id: "bpm-asc", label: "BPM: low to high" },
  { id: "bpm-desc", label: "BPM: high to low" },
];
const LIBRARY_BPM_FILTER_MODES = [
  { id: "any", label: "Any BPM" },
  { id: "exact", label: "Exact BPM" },
  { id: "pm5", label: "BPM ±5" },
  { id: "pm10", label: "BPM ±10" },
];

const TUPLET_OPTIONS = [null, 3, 5, 6, 7, 9];
const TUPLET_COLOR_CLASS = {
  3: "bg-amber-900/25",
  5: "bg-indigo-700/25",
  6: "bg-amber-700/25",
  7: "bg-emerald-700/25",
  9: "bg-fuchsia-700/25",
};

function encodeBase64UrlUtf8(input) {
  try {
    const bytes = new TextEncoder().encode(input);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch (_) {
    return "";
  }
}

function decodeBase64UrlUtf8(input) {
  try {
    const padded = `${input}`.replace(/-/g, "+").replace(/_/g, "/");
    const base64 = padded + "===".slice((padded.length + 3) % 4);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (_) {
    return null;
  }
}

function encodeShareState(state) {
  try {
    return encodeBase64UrlUtf8(JSON.stringify(state));
  } catch (_) {
    return "";
  }
}

function decodeShareState(raw) {
  if (!raw) return null;
  const json = decodeBase64UrlUtf8(raw);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function normalizeArrangementItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: String(item?.id || ""),
      source: item?.source === "public" ? "public" : "local",
      beatId: String(item?.beatId || ""),
      repeats: Math.max(1, Math.min(64, Number(item?.repeats) || 1)),
    }))
    .filter((item) => item.id && item.beatId);
}

const EMBED_EXAMPLES = {
  rock8: {
    id: "rock8",
    title: "Basic 8th Rock",
    preset: "ksh",
    bars: 1,
    resolution: 8,
    timeSig: { n: 4, d: 4 },
    tupletsByBar: [[null, null, null, null]],
    hits: [
      {
        instId: "hihat",
        bars: "all",
        positions: [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8],
      },
      { instId: "snare", bars: "all", positions: [1 / 4, 3 / 4] },
      { instId: "kick", bars: "all", positions: [0, 1 / 2, 5 / 8] },
    ],
  },
  funk16: {
    id: "funk16",
    title: "16th Funk",
    preset: "ksh",
    bars: 1,
    resolution: 16,
    timeSig: { n: 4, d: 4 },
    tupletsByBar: [[null, null, null, null]],
    hits: [
      {
        instId: "hihat",
        bars: "all",
        positions: [
          0 / 16, 1 / 16, 2 / 16, 3 / 16, 4 / 16, 5 / 16, 6 / 16, 7 / 16,
          8 / 16, 9 / 16, 10 / 16, 11 / 16, 12 / 16, 13 / 16, 14 / 16, 15 / 16,
        ],
      },
      { instId: "snare", bars: "all", positions: [1 / 4, 3 / 4] },
      { instId: "snare", bars: "all", value: CELL.GHOST, positions: [3 / 16, 11 / 16] },
      { instId: "kick", bars: "all", positions: [0, 3 / 8, 1 / 2, 13 / 16] },
    ],
  },
  shuffle: {
    id: "shuffle",
    title: "Triplet Shuffle",
    preset: "ksh",
    bars: 1,
    resolution: 8,
    timeSig: { n: 4, d: 4 },
    tupletsByBar: [[3, 3, 3, 3]],
    hits: [
      {
        instId: "hihat",
        bars: "all",
        positions: [
          0 / 12, 2 / 12, 3 / 12, 5 / 12, 6 / 12, 8 / 12, 9 / 12, 11 / 12,
        ],
      },
      { instId: "snare", bars: "all", positions: [1 / 4, 3 / 4] },
      { instId: "kick", bars: "all", positions: [0, 1 / 2, 8 / 12] },
    ],
  },
  fill: {
    id: "fill",
    title: "Groove + Fill",
    preset: "standard",
    bars: 2,
    resolution: 8,
    timeSig: { n: 4, d: 4 },
    tupletsByBar: [
      [null, null, null, null],
      [null, null, null, null],
    ],
    hits: [
      {
        instId: "hihat",
        bars: [0, 1],
        positions: [0, 1 / 8, 2 / 8, 3 / 8, 4 / 8, 5 / 8, 6 / 8, 7 / 8],
      },
      { instId: "snare", bars: [0, 1], positions: [1 / 4, 3 / 4] },
      { instId: "kick", bars: [0, 1], positions: [0, 1 / 2, 5 / 8] },
      { instId: "tom1", bars: [1], positions: [6 / 8] },
      { instId: "tom2", bars: [1], positions: [7 / 8] },
      { instId: "floorTom", bars: [1], positions: [15 / 16] },
    ],
  },
};

function getQuarterBeatsPerBar(ts) {
  return Math.max(1, Math.round((ts.n * 4) / ts.d));
}

function getBaseSubdivPerQuarter(resolution) {
  return Math.max(1, Math.round(resolution / 4));
}

function buildTupletOverrides(count) {
  return Array.from({ length: count }, () => null);
}

function clampTupletValue(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(2, Math.min(12, Math.round(n)));
}

function resolveQuarterSubdivisions(tupletOverrides, baseSubdiv) {
  return (tupletOverrides || []).map((v) => clampTupletValue(v) ?? baseSubdiv);
}

function buildTupletOverridesByBar(barCount, quarterCount) {
  return Array.from({ length: Math.max(1, barCount) }, () => buildTupletOverrides(quarterCount));
}

function buildNotationStateFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;
  const bars = Math.max(1, Math.min(64, Number(payload.bars) || 1));
  const rawRes = Number(payload.resolution);
  const resolution = [4, 8, 16, 32].includes(rawRes) ? rawRes : 8;
  const rawTs = payload.timeSig || {};
  const timeSig = {
    n: Math.max(1, Number(rawTs.n) || 4),
    d: Math.max(1, Number(rawTs.d) || 4),
  };
  const quarterCount = getQuarterBeatsPerBar(timeSig);
  const baseSubdiv = getBaseSubdivPerQuarter(resolution);
  const tupletsByBar = Array.from({ length: bars }, (_, barIdx) =>
    Array.from({ length: quarterCount }, (_, qIdx) => {
      const raw = payload.tupletsByBar?.[barIdx]?.[qIdx];
      return clampTupletValue(raw) ?? null;
    })
  );
  const quarterSubdivisionsByBar = tupletsByBar.map((row) =>
    resolveQuarterSubdivisions(row, baseSubdiv)
  );
  const barStepOffsets = [0];
  for (let b = 0; b < bars; b++) {
    const stepsInBar = quarterSubdivisionsByBar[b].reduce(
      (sum, n) => sum + Math.max(1, Number(n) || 1),
      0
    );
    barStepOffsets.push(barStepOffsets[b] + stepsInBar);
  }
  const columns = barStepOffsets[barStepOffsets.length - 1] ?? 0;
  const kitIds = Array.isArray(payload.kitInstrumentIds)
    ? [...new Set(payload.kitInstrumentIds.filter((id) => INSTRUMENT_BY_ID[id]))]
    : [];
  const safeKitIds = kitIds.length ? kitIds : DRUMKIT_PRESETS.standard;
  const instruments = safeKitIds.map((id) => INSTRUMENT_BY_ID[id]).filter(Boolean);
  const grid = {};
  instruments.forEach((inst) => {
    const row = Array(columns).fill(CELL.OFF);
    const events = payload.grid?.[inst.id];
    if (Array.isArray(events)) {
      events.forEach((event) => {
        const idx = Number(Array.isArray(event) ? event[0] : null);
        if (!Number.isFinite(idx)) return;
        if (idx < 0 || idx >= columns) return;
        const valRaw = Number(Array.isArray(event) ? event[1] : 1);
        row[idx] = valRaw === 3 ? CELL.ACCENT : valRaw === 2 ? CELL.GHOST : CELL.ON;
      });
    }
    grid[inst.id] = row;
  });
  return {
    instruments,
    grid,
    resolution,
    bars,
    barsPerLine: Math.max(1, Math.min(4, bars)),
    timeSig,
    quarterSubdivisionsByBar,
    barStepOffsets,
  };
}

function getBarIndexForStepFromPayload(payload, stepIndex) {
  if (!payload || typeof payload !== "object") return 0;
  const bars = Math.max(1, Math.min(64, Number(payload.bars) || 1));
  const rawRes = Number(payload.resolution);
  const resolution = [4, 8, 16, 32].includes(rawRes) ? rawRes : 8;
  const rawTs = payload.timeSig || {};
  const timeSig = {
    n: Math.max(1, Number(rawTs.n) || 4),
    d: Math.max(1, Number(rawTs.d) || 4),
  };
  const quarterCount = getQuarterBeatsPerBar(timeSig);
  const baseSubdiv = getBaseSubdivPerQuarter(resolution);
  const tupletsByBar = Array.from({ length: bars }, (_, barIdx) =>
    Array.from({ length: quarterCount }, (_, qIdx) => {
      const raw = payload.tupletsByBar?.[barIdx]?.[qIdx];
      return clampTupletValue(raw) ?? null;
    })
  );
  const quarterSubdivisionsByBar = tupletsByBar.map((row) =>
    resolveQuarterSubdivisions(row, baseSubdiv)
  );
  const barStepOffsets = [0];
  for (let b = 0; b < bars; b++) {
    const stepsInBar = quarterSubdivisionsByBar[b].reduce(
      (sum, n) => sum + Math.max(1, Number(n) || 1),
      0
    );
    barStepOffsets.push(barStepOffsets[b] + stepsInBar);
  }
  const step = Math.max(0, Number(stepIndex) || 0);
  for (let b = 0; b < bars; b++) {
    const start = barStepOffsets[b] ?? 0;
    const end = barStepOffsets[b + 1] ?? start;
    if (step >= start && step < end) return b;
  }
  return Math.max(0, bars - 1);
}

function expandNotationStateForRepeats(state, repeats) {
  const count = Math.max(1, Number(repeats) || 1);
  if (!state || count <= 1) return state;
  const baseBars = Math.max(1, Number(state.bars) || 1);
  const baseColumns = Math.max(0, Number(state.barStepOffsets?.[baseBars] ?? 0));
  const quarterSubdivisionsByBar = [];
  for (let i = 0; i < count; i++) {
    (state.quarterSubdivisionsByBar || []).forEach((row) => {
      quarterSubdivisionsByBar.push(Array.isArray(row) ? [...row] : []);
    });
  }
  const barStepOffsets = [0];
  for (let b = 0; b < quarterSubdivisionsByBar.length; b++) {
    const stepsInBar = quarterSubdivisionsByBar[b].reduce(
      (sum, n) => sum + Math.max(1, Number(n) || 1),
      0
    );
    barStepOffsets.push(barStepOffsets[b] + stepsInBar);
  }
  const grid = {};
  (state.instruments || []).forEach((inst) => {
    const src = Array.isArray(state.grid?.[inst.id]) ? state.grid[inst.id] : [];
    const row = Array(baseColumns * count).fill(CELL.OFF);
    for (let i = 0; i < count; i++) {
      for (let c = 0; c < baseColumns; c++) {
        const v = src[c] ?? CELL.OFF;
        if (v !== CELL.OFF) row[i * baseColumns + c] = v;
      }
    }
    grid[inst.id] = row;
  });
  return {
    ...state,
    grid,
    bars: baseBars * count,
    barsPerLine: Math.max(1, Math.min(4, baseBars * count)),
    quarterSubdivisionsByBar,
    barStepOffsets,
  };
}

function mergeNotationStates(states) {
  const valid = (Array.isArray(states) ? states : []).filter(
    (s) => s && Array.isArray(s.instruments) && s.timeSig && Number.isFinite(s.resolution)
  );
  if (!valid.length) return null;

  const instrumentIds = [];
  const seen = new Set();
  valid.forEach((s) => {
    (s.instruments || []).forEach((inst) => {
      const id = inst?.id;
      if (!id || seen.has(id)) return;
      seen.add(id);
      instrumentIds.push(id);
    });
  });
  const instruments = instrumentIds.map((id) => INSTRUMENT_BY_ID[id]).filter(Boolean);

  const bars = valid.reduce((sum, s) => sum + Math.max(1, Number(s.bars) || 1), 0);
  const quarterSubdivisionsByBar = [];
  valid.forEach((s) => {
    (s.quarterSubdivisionsByBar || []).forEach((row) => {
      quarterSubdivisionsByBar.push(Array.isArray(row) ? [...row] : []);
    });
  });
  const barStepOffsets = [0];
  for (let b = 0; b < quarterSubdivisionsByBar.length; b++) {
    const stepsInBar = quarterSubdivisionsByBar[b].reduce(
      (sum, n) => sum + Math.max(1, Number(n) || 1),
      0
    );
    barStepOffsets.push(barStepOffsets[b] + stepsInBar);
  }
  const columns = barStepOffsets[barStepOffsets.length - 1] ?? 0;

  const grid = {};
  instruments.forEach((inst) => {
    grid[inst.id] = Array(columns).fill(CELL.OFF);
  });

  let colOffset = 0;
  valid.forEach((s) => {
    const sBars = Math.max(1, Number(s.bars) || 1);
    const sCols = Math.max(0, Number(s.barStepOffsets?.[sBars] ?? 0));
    instruments.forEach((inst) => {
      const src = Array.isArray(s.grid?.[inst.id]) ? s.grid[inst.id] : [];
      const dst = grid[inst.id];
      for (let c = 0; c < sCols; c++) {
        const v = src[c] ?? CELL.OFF;
        if (v !== CELL.OFF) dst[colOffset + c] = v;
      }
    });
    colOffset += sCols;
  });

  return {
    instruments,
    grid,
    resolution: valid[0].resolution,
    bars,
    barsPerLine: 4,
    timeSig: valid[0].timeSig,
    quarterSubdivisionsByBar,
    barStepOffsets,
  };
}

function computeStickingAssignmentsForNotationState(state, opts = {}) {
  if (!state) return [];
  const instruments = Array.isArray(state.instruments) ? state.instruments : [];
  const grid = state.grid || {};
  const bars = Math.max(1, Number(state.bars) || 1);
  const barStepOffsets = Array.isArray(state.barStepOffsets) ? state.barStepOffsets : [0];
  const columns = Math.max(0, Number(barStepOffsets?.[bars] ?? 0));
  const quarterSubdivisionsByBar = Array.isArray(state.quarterSubdivisionsByBar)
    ? state.quarterSubdivisionsByBar
    : [];
  const handedness = opts.stickingHandedness === "left" ? "left" : "right";
  const lead = opts.stickingLeadHand === "left" ? "L" : "R";
  const keepQuarterLeadHand = opts.stickingKeepQuarterLeadHand !== false;

  const handIds = instruments.map((inst) => inst?.id).filter((id) => id && !FOOT_INSTRUMENTS.has(id));
  const out = Array.from({ length: columns }, () => ({}));
  const lastByInst = {};
  let lastSingle = null;

  const quarterDownbeatStepSet = new Set();
  for (let b = 0; b < quarterSubdivisionsByBar.length; b++) {
    const barOffset = barStepOffsets?.[b] ?? 0;
    const row = Array.isArray(quarterSubdivisionsByBar[b]) ? quarterSubdivisionsByBar[b] : [];
    let acc = 0;
    for (let q = 0; q < row.length; q++) {
      quarterDownbeatStepSet.add(barOffset + acc);
      acc += Math.max(1, Number(row[q]) || 1);
    }
  }

  const canAlternateAtStep = (a, b) => {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    const spacing = b - a;
    return keepQuarterLeadHand ? spacing < 2 : spacing <= 2;
  };

  for (let step = 0; step < columns; step++) {
    const hits = handIds
      .filter((id) => (grid[id]?.[step] ?? CELL.OFF) !== CELL.OFF)
      .map((id) => ({ id, pos: getHandPositionForInstrument(id, handedness) }))
      .sort((a, b) => a.pos - b.pos);
    if (!hits.length) continue;

    if (hits.length === 1) {
      const hit = hits[0];
      let hand = lead;
      if (hit.id === "ride" || hit.id === "rideBell") {
        hand = "R";
      } else if (keepQuarterLeadHand && quarterDownbeatStepSet.has(step)) {
        hand = lead;
      } else {
        const prev = lastByInst[hit.id];
        if (prev && canAlternateAtStep(prev.step, step)) {
          hand = prev.hand === "L" ? "R" : "L";
        } else if (lastSingle && canAlternateAtStep(lastSingle.step, step)) {
          hand = lastSingle.hand === "L" ? "R" : "L";
        } else if ((hit.id === "hihat" || hit.id === "hihatOpen") && !prev) {
          hand = "R";
        } else {
          hand = lead;
        }
      }
      out[step][hit.id] = hand;
      lastByInst[hit.id] = { hand, step };
      lastSingle = { hand, step, instId: hit.id };
      continue;
    }

    const low = hits[0];
    const high = hits[1];
    const defaultPair = handedness === "left" ? { low: "R", high: "L" } : { low: "L", high: "R" };
    let lowHand = defaultPair.low;
    let highHand = defaultPair.high;
    if (low.id === "ride" || low.id === "rideBell") lowHand = "R";
    if (high.id === "ride" || high.id === "rideBell") highHand = "R";
    if (lowHand === highHand) {
      highHand = lowHand === "L" ? "R" : "L";
    }
    out[step][low.id] = lowHand;
    out[step][high.id] = highHand;
    lastByInst[low.id] = { hand: lowHand, step };
    lastByInst[high.id] = { hand: highHand, step };

    for (let i = 2; i < hits.length; i++) {
      const hit = hits[i];
      const hand = Math.abs(hit.pos - (handedness === "left" ? 2.6 : 1.4))
        <= Math.abs(hit.pos - (handedness === "left" ? 1.4 : 2.6))
        ? "L"
        : "R";
      out[step][hit.id] = hand;
      lastByInst[hit.id] = { hand, step };
    }
    lastSingle = null;
  }
  return out;
}

function buildStepMeta(quarterSubdivisions) {
  const quarterCount = Math.max(1, quarterSubdivisions.length);
  const meta = [];
  quarterSubdivisions.forEach((subdiv, q) => {
    const s = Math.max(1, Number(subdiv) || 1);
    for (let sub = 0; sub < s; sub++) {
      const startNorm = (q + sub / s) / quarterCount;
      const centerNorm = (q + (sub + 0.5) / s) / quarterCount;
      meta.push({ quarterIndex: q, subIndex: sub, subdiv: s, startNorm, centerNorm });
    }
  });
  return meta;
}

function remapGridByStepMeta(prevGrid, oldMeta, newMeta, bars, cellOff, allInstruments, rankFn) {
  const oldStepsPerBar = Math.max(1, oldMeta.length);
  const newStepsPerBar = Math.max(1, newMeta.length);
  const out = {};
  allInstruments.forEach((inst) => {
    const row = Array(bars * newStepsPerBar).fill(cellOff);
    for (let b = 0; b < bars; b++) {
      for (let oldStep = 0; oldStep < oldStepsPerBar; oldStep++) {
        const oldGlobal = b * oldStepsPerBar + oldStep;
        const val = prevGrid[inst.id]?.[oldGlobal] ?? cellOff;
        if (val === cellOff) continue;
        const oldEntry = oldMeta[oldStep];
        let bestIdx = 0;
        let bestDist = Infinity;
        const eps = 1e-9;
        const oldQuarter = oldEntry?.quarterIndex;
        const hasQuarter = Number.isFinite(oldQuarter);
        const oldPhase =
          oldEntry && oldEntry.subdiv > 0 ? oldEntry.subIndex / oldEntry.subdiv : null;
        const useQuarterLocal = hasQuarter && oldPhase != null;

        if (useQuarterLocal) {
          const oldSubdiv = Math.max(1, oldEntry?.subdiv || 1);
          const newSubdiv = Math.max(1, (newMeta.find((m) => m?.quarterIndex === oldQuarter)?.subdiv) || 1);
          let targetSub = 0;
          if (newSubdiv % oldSubdiv === 0) {
            // Exact integer upscale: preserve exact phase grid points (e.g. 3->6, 2->6).
            targetSub = oldEntry.subIndex * (newSubdiv / oldSubdiv);
          } else {
            const raw = oldPhase * newSubdiv;
            targetSub = Math.round(raw);
          }
          targetSub = Math.max(0, Math.min(newSubdiv - 1, targetSub));
          const mappedIdx = newMeta.findIndex(
            (m) => m?.quarterIndex === oldQuarter && m?.subIndex === targetSub
          );
          if (mappedIdx >= 0) {
            bestIdx = mappedIdx;
            bestDist = 0;
          }
        }
        if (bestDist !== 0) {
          for (let newStep = 0; newStep < newStepsPerBar; newStep++) {
            const nextEntry = newMeta[newStep];
            if (useQuarterLocal && nextEntry?.quarterIndex !== oldQuarter) continue;
            const nextPhase =
              useQuarterLocal && nextEntry?.subdiv > 0
                ? nextEntry.subIndex / nextEntry.subdiv
                : (nextEntry?.startNorm ?? (newStep / newStepsPerBar));
            const oldRef = useQuarterLocal ? oldPhase : (oldEntry?.startNorm ?? (oldStep / oldStepsPerBar));
            const d = Math.abs(nextPhase - oldRef);
            if (d + eps < bestDist || (Math.abs(d - bestDist) <= eps && newStep < bestIdx)) {
              bestDist = d;
              bestIdx = newStep;
            }
          }
        }
        const nextGlobal = b * newStepsPerBar + bestIdx;
        const cur = row[nextGlobal] ?? cellOff;
        row[nextGlobal] = rankFn(val) >= rankFn(cur) ? val : cur;
      }
    }
    out[inst.id] = row;
  });
  return out;
}

function assignPhasesToSlots(phases, slotCount) {
  const n = Math.max(1, Number(slotCount) || 1);
  const m = phases.length;
  if (m === 0) return [];
  if (m > n) {
    return phases.map((p) => Math.max(0, Math.min(n - 1, Math.round(p * n))));
  }

  const cost = (phase, slot) => {
    const slotPhase = slot / n;
    const d = slotPhase - phase;
    return d * d;
  };

  const dp = Array.from({ length: m }, () => Array(n).fill(Infinity));
  const prev = Array.from({ length: m }, () => Array(n).fill(-1));
  const eps = 1e-12;

  for (let j = 0; j < n; j++) dp[0][j] = cost(phases[0], j);

  for (let i = 1; i < m; i++) {
    for (let j = i; j < n; j++) {
      const c = cost(phases[i], j);
      let best = Infinity;
      let bestK = -1;
      for (let k = i - 1; k < j; k++) {
        const cand = dp[i - 1][k] + c;
        if (cand + eps < best || (Math.abs(cand - best) <= eps && (bestK < 0 || k < bestK))) {
          best = cand;
          bestK = k;
        }
      }
      dp[i][j] = best;
      prev[i][j] = bestK;
    }
  }

  let endJ = m - 1;
  let endCost = Infinity;
  for (let j = m - 1; j < n; j++) {
    const cand = dp[m - 1][j];
    if (cand + eps < endCost || (Math.abs(cand - endCost) <= eps && j < endJ)) {
      endCost = cand;
      endJ = j;
    }
  }

  const out = Array(m).fill(0);
  let curJ = endJ;
  for (let i = m - 1; i >= 0; i--) {
    out[i] = curJ;
    curJ = prev[i][curJ];
  }
  return out;
}

// Visuals
const CELL_COLOR = {
  [CELL.OFF]: "bg-neutral-800",
  [CELL.ON]: "bg-[#00b3ba]",
  [CELL.GHOST]: "bg-[#00b3ba]/35",
  [CELL.ACCENT]: "bg-[#00b3ba]",
};

// Ghost note support (MVP)
const GHOST_ENABLED = new Set(["snare", "tom1", "tom2", "floorTom", "hihat"]);
const FOOT_INSTRUMENTS = new Set(["kick", "hihatFoot"]);
const INSTRUMENT_HAND_POSITION = {
  splash: 0.8,
  china: 3.9,
  crash2: 3.5,
  crash1: 1.0,
  ride: 3.2,
  rideBell: 3.0,
  hihatOpen: 0.2,
  hihat: 0.2,
  cowbell: 2.2,
  tom1: 2.4,
  tom2: 2.0,
  floorTom: 3.0,
  sideStick: 1.8,
  snare: 1.8,
};

function getHandPositionForInstrument(instId, handedness) {
  const base = INSTRUMENT_HAND_POSITION[instId] ?? 2;
  return handedness === "left" ? 4 - base : base;
}

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
  const [routeOptions] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const embedRaw = (params.get("embed") || "").toLowerCase();
    const embed = embedRaw === "1" || embedRaw === "true" || embedRaw === "yes";
    const exampleId = (params.get("example") || "").trim().toLowerCase();
    const shared = (params.get("s") || "").trim();
    const pathname = window.location.pathname || "/";
    const shareMatch = pathname.match(/^\/g\/([A-Za-z0-9_-]{4,64})\/?$/);
    const shareId = shareMatch ? shareMatch[1] : "";
    return { embed, exampleId, shared, shareId };
  });
  const isEmbedMode = routeOptions.embed;
  const requestedExample = React.useMemo(() => {
    if (!routeOptions.exampleId) return null;
    return EMBED_EXAMPLES[routeOptions.exampleId] || null;
  }, [routeOptions.exampleId]);
  const requestedSharedState = React.useMemo(
    () => decodeShareState(routeOptions.shared),
    [routeOptions.shared]
  );
  const [resolvedSharedState, setResolvedSharedState] = useState(() => {
    const preloadedId = window.__DG_PRELOADED_SHARE_ID;
    const preloadedPayload = window.__DG_PRELOADED_SHARE_PAYLOAD;
    if (routeOptions.shareId && preloadedId === routeOptions.shareId && preloadedPayload && typeof preloadedPayload === "object") {
      return preloadedPayload;
    }
    return null;
  });

  const [kitInstrumentIds, setKitInstrumentIds] = useState(DRUMKIT_PRESETS.standard);
  const instruments = React.useMemo(
    () => kitInstrumentIds.map((id) => INSTRUMENT_BY_ID[id]).filter(Boolean),
    [kitInstrumentIds]
  );
  const [isKitEditorOpen, setIsKitEditorOpen] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState(null); // { instId, moveTargetId }
  const [pendingPresetChange, setPendingPresetChange] = useState(null); // { presetName, targetIds, removedWithNotes }
  const [keepTracksWithNotesEnabled, setKeepTracksWithNotesEnabled] = useState(true);
  const [showPresetChangeWarningEnabled, setShowPresetChangeWarningEnabled] = useState(false);
  const [isShareActionsDialogOpen, setIsShareActionsDialogOpen] = useState(false);
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [isMidiDialogOpen, setIsMidiDialogOpen] = useState(false);
  const [isLegalDialogOpen, setIsLegalDialogOpen] = useState(false);
  const [isPreferencesDialogOpen, setIsPreferencesDialogOpen] = useState(false);
  const [preferencesCategory, setPreferencesCategory] = useState(() => {
    try {
      const raw = (window.localStorage.getItem(PREFERENCES_CATEGORY_STORAGE_KEY) || "").toLowerCase();
      const allowed = new Set(["timing", "notation", "editor", "library", "playback", "appearance"]);
      return allowed.has(raw) ? raw : "timing";
    } catch (_) {
      return "timing";
    }
  });
  const [showPrefsPlaybackInfo, setShowPrefsPlaybackInfo] = useState(false);
  const [legalTab, setLegalTab] = useState("impressum"); // impressum | privacy
  const [showLegalEmail, setShowLegalEmail] = useState(false);
  const [arrangementBoundaryCompScale, setArrangementBoundaryCompScale] = useState(() => {
    try {
      const raw = Number(window.localStorage.getItem(ARRANGEMENT_BOUNDARY_COMP_SCALE_STORAGE_KEY));
      if (!Number.isFinite(raw)) return 0;
      return Math.max(-40, Math.min(40, Math.round(raw)));
    } catch (_) {
      return 0;
    }
  });
  const arrangementBoundaryCompMs = arrangementBoundaryCompScale - 40;
  const [arrangementAdaptiveCompEnabled, setArrangementAdaptiveCompEnabled] = useState(() => {
    try {
      const raw = window.localStorage.getItem(ARRANGEMENT_ADAPTIVE_COMP_ENABLED_STORAGE_KEY);
      if (raw == null) return true;
      return raw === "1";
    } catch (_) {
      return true;
    }
  });
  const [arrangementAdaptiveCurrentCompMs, setArrangementAdaptiveCurrentCompMs] = useState(
    arrangementBoundaryCompMs
  );
  const [legacySelectionEnabled, setLegacySelectionEnabled] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LEGACY_SELECTION_ENABLED_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [moveModeDebugEnabled, setMoveModeDebugEnabled] = useState(() => {
    try {
      const raw = window.localStorage.getItem(MOVE_MODE_DEBUG_ENABLED_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [stickingGuideEnabled, setStickingGuideEnabled] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STICKING_GUIDE_ENABLED_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [stickingHandedness, setStickingHandedness] = useState(() => {
    try {
      const raw = (window.localStorage.getItem(STICKING_HANDEDNESS_STORAGE_KEY) || "").toLowerCase();
      return raw === "left" ? "left" : "right";
    } catch (_) {
      return "right";
    }
  });
  const [stickingLeadHand, setStickingLeadHand] = useState(() => {
    try {
      const raw = (window.localStorage.getItem(STICKING_LEAD_HAND_STORAGE_KEY) || "").toLowerCase();
      if (raw === "left" || raw === "right") return raw;
      return "right";
    } catch (_) {
      return "right";
    }
  });
  const [stickingEditModeEnabled, setStickingEditModeEnabled] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STICKING_EDIT_MODE_ENABLED_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [stickingOverrides, setStickingOverrides] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STICKING_OVERRIDES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      if (!parsed || typeof parsed !== "object") return {};
      const out = {};
      Object.entries(parsed).forEach(([k, v]) => {
        if (v === "L" || v === "R") out[k] = v;
      });
      return out;
    } catch (_) {
      return {};
    }
  });
  const [stickingKeepQuarterLeadHand, setStickingKeepQuarterLeadHand] = useState(() => {
    try {
      const raw = window.localStorage.getItem(STICKING_KEEP_QUARTER_LEAD_HAND_STORAGE_KEY);
      if (raw == null) return true;
      return raw === "1";
    } catch (_) {
      return true;
    }
  });
  const [showEditedSticking, setShowEditedSticking] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SHOW_EDITED_STICKING_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [showNotationSticking, setShowNotationSticking] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SHOW_NOTATION_STICKING_STORAGE_KEY);
      if (raw == null) return false;
      return raw === "1";
    } catch (_) {
      return false;
    }
  });
  const [notationStickingView, setNotationStickingView] = useState(() => {
    try {
      const raw = window.localStorage.getItem(NOTATION_STICKING_VIEW_STORAGE_KEY);
      return raw === "split-rows" ? "split-rows" : "stacked";
    } catch (_) {
      return "stacked";
    }
  });
  const [isBeatLibraryOpen, setIsBeatLibraryOpen] = useState(false);
  const [isArrangementOpen, setIsArrangementOpen] = useState(false);
  const [isArrangementNotationOpen, setIsArrangementNotationOpen] = useState(false);
  const [arrangementNotationViewMode, setArrangementNotationViewMode] = useState("sheet"); // sections | sheet
  const [arrangementPlaybackEnabled, setArrangementPlaybackEnabled] = useState(false);
  const [arrangementPlaybackIndex, setArrangementPlaybackIndex] = useState(0);
  const [arrangementSelection, setArrangementSelection] = useState(null); // {start,end} row indices
  const [arrangementSelectionAnchor, setArrangementSelectionAnchor] = useState(null); // row index
  const [arrangementPos, setArrangementPos] = useState({ x: 56, y: 112 });
  const [arrangementNotationPos, setArrangementNotationPos] = useState({ x: 56, y: 128 });
  const [isPublicSubmitDialogOpen, setIsPublicSubmitDialogOpen] = useState(false);
  const [beatLibraryPos, setBeatLibraryPos] = useState({ x: 56, y: 80 });
  const [beatLibraryTab, setBeatLibraryTab] = useState("local"); // local | public
  const [loadedLocalBeatId, setLoadedLocalBeatId] = useState(null);
  const [arrangementSourceTab, setArrangementSourceTab] = useState("local"); // local | public
  const [arrangementSourcesCollapsed, setArrangementSourcesCollapsed] = useState(false);
  const [arrangementDetailsCollapsed, setArrangementDetailsCollapsed] = useState(true);
  const arrangementPanelWidth = arrangementSourcesCollapsed || arrangementDetailsCollapsed ? 576 : 1088; // max-w-[36rem] / max-w-[68rem]
  const [arrangementItems, setArrangementItems] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SONG_ARRANGEMENT_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return normalizeArrangementItems(parsed);
    } catch (_) {
      return [];
    }
  });
  const [savedArrangements, setSavedArrangements] = useState(() => {
    try {
      const raw = window.localStorage.getItem(SONG_ARRANGEMENT_LIBRARY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((entry) => ({
          id: String(entry?.id || ""),
          name: String(entry?.name || "").trim(),
          updatedAt: String(entry?.updatedAt || entry?.createdAt || ""),
          createdAt: String(entry?.createdAt || entry?.updatedAt || ""),
          items: normalizeArrangementItems(entry?.items),
        }))
        .filter((entry) => entry.id && entry.name && entry.items.length > 0);
    } catch (_) {
      return [];
    }
  });
  const [arrangementNameDraft, setArrangementNameDraft] = useState("");
  const [loadedArrangementId, setLoadedArrangementId] = useState(null);
  const [beatNameDraft, setBeatNameDraft] = useState("");
  const [publicSubmitTitle, setPublicSubmitTitle] = useState("");
  const [publicSubmitComposer, setPublicSubmitComposer] = useState("");
  const [publicSubmitCategory, setPublicSubmitCategory] = useState("all");
  const [publicSubmitStyle, setPublicSubmitStyle] = useState("all");
  const [lockedPublicComposer, setLockedPublicComposer] = useState(() => {
    try {
      const raw = window.localStorage.getItem(PUBLIC_SUBMIT_COMPOSER_STORAGE_KEY);
      return String(raw || "").trim();
    } catch (_) {
      return "";
    }
  });
  const [beatCategoryDraft, setBeatCategoryDraft] = useState("all");
  const [beatStyleDraft, setBeatStyleDraft] = useState("all");
  const [librarySort, setLibrarySort] = useState("latest"); // latest | oldest
  const [libraryTimeSigFilter, setLibraryTimeSigFilter] = useState("all");
  const [libraryBpmFilterMode, setLibraryBpmFilterMode] = useState("any"); // any | exact | pm5 | pm10
  const [libraryBpmTarget, setLibraryBpmTarget] = useState(120);
  const [localBeats, setLocalBeats] = useState(() => {
    try {
      const raw = window.localStorage.getItem(LOCAL_BEAT_LIBRARY_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  });
  const [localBeatPast, setLocalBeatPast] = useState([]);
  const [localBeatFuture, setLocalBeatFuture] = useState([]);
  const [publicBeats, setPublicBeats] = useState([]);
  const [publicLibraryLoading, setPublicLibraryLoading] = useState(false);
  const [publicLibraryError, setPublicLibraryError] = useState("");
  const [savedPresets, setSavedPresets] = useState(() => {
    try {
      const raw = window.localStorage.getItem(USER_PRESETS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((p) => ({
          id: String(p?.id || ""),
          label: String(p?.label || ""),
          ids: Array.isArray(p?.ids) ? p.ids.filter((id) => INSTRUMENT_BY_ID[id]) : [],
        }))
        .filter((p) => p.id && p.label && p.ids.length > 0 && !DRUMKIT_PRESETS[p.id]);
    } catch (_) {
      return [];
    }
  });
  const [modifiedPresetBase, setModifiedPresetBase] = useState(null); // built-in/user preset name for "preset*" variants
  const [isSaveAsDialogOpen, setIsSaveAsDialogOpen] = useState(false);
  const [saveAsName, setSaveAsName] = useState("");
  const [presetNameInlineDraft, setPresetNameInlineDraft] = useState("");
  const availableInstrumentButtonWidthCh = React.useMemo(
    () => Math.max(...ALL_INSTRUMENTS.map((inst) => inst.label.length)) + 2,
    []
  );

  const [resolution, setResolution] = useState(8); // 4, 8, 16, 32
  const [bars, setBars] = useState(2);
  const [barsPerLine, setBarsPerLine] = useState(4);
  const [gridBarsPerLine, setGridBarsPerLine] = useState(4);
  const [layout, setLayout] = useState("grid-top");
  const [activeTab, setActiveTab] = useState("none"); // none | timing | notation | selection
  const [timeSig, setTimeSig] = useState({ n: 4, d: 4 });
  const [keepTiming, setKeepTiming] = useState(true);
  const [playabilityWarningsEnabled, setPlayabilityWarningsEnabled] = useState(true);
  const [tupletOverridesByBar, setTupletOverridesByBar] = useState(() =>
    buildTupletOverridesByBar(2, getQuarterBeatsPerBar({ n: 4, d: 4 }))
  );

  const [bpm, setBpm] = useState(120);
  const [isBraveBrowser, setIsBraveBrowser] = useState(false);
  const [showBraveAudioNotice, setShowBraveAudioNotice] = useState(true);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareLinkType, setShareLinkType] = useState("");
  const [bpmDraft, setBpmDraft] = useState("120");
  const [menuViewportTick, setMenuViewportTick] = useState(0);
  const activeTabRef = React.useRef(activeTab);
  const wasBeatLibraryOpenRef = React.useRef(false);
  const beatLibraryDragRef = React.useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });
  const arrangementDragRef = React.useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });
  const arrangementNotationDragRef = React.useRef({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });
  const arrangementPanelRef = React.useRef(null);
  const arrangementNotationPanelRef = React.useRef(null);
  const beatLibraryPanelRef = React.useRef(null);
  const kitOrderListRef = React.useRef(null);
  const arrangementListRef = React.useRef(null);
  const applyImportedBeatPayloadRef = React.useRef(null);
  const playbackPlayRef = React.useRef(null);
  const arrangementStartedRef = React.useRef(false);
  const arrangementNextSwitchAtRef = React.useRef(0);
  const arrangementSchedulerRef = React.useRef(null);
  const arrangementAdaptiveCompMsRef = React.useRef(0);
  const arrangementPlayableEntriesRef = React.useRef([]);
  const arrangementLoopRangeRef = React.useRef(null);
  const arrangementPlaybackIndexRef = React.useRef(0);
  const shareCopiedTimerRef = React.useRef(null);
  const stickingSelectionCycleRef = React.useRef({ signature: "", phase: -1 });
  const pendingExampleLoadRef = React.useRef(null);
  const appliedExampleIdRef = React.useRef(null);
  const pendingSharedLoadRef = React.useRef(null);
  const appliedSharedKeyRef = React.useRef(null);
  const gridMenuRowPrimaryRef = React.useRef(null);
  const gridMenuRowSecondaryRef = React.useRef(null);
  const notationMenuRowRef = React.useRef(null);
  const selectionMenuRowRef = React.useRef(null);

  useEffect(() => {
    setBpmDraft(String(bpm));
  }, [bpm]);
  useEffect(() => {
    try {
      if (lockedPublicComposer) {
        window.localStorage.setItem(PUBLIC_SUBMIT_COMPOSER_STORAGE_KEY, lockedPublicComposer);
      } else {
        window.localStorage.removeItem(PUBLIC_SUBMIT_COMPOSER_STORAGE_KEY);
      }
    } catch (_) {}
  }, [lockedPublicComposer]);
  useEffect(() => {
    try {
      window.localStorage.setItem(SONG_ARRANGEMENT_STORAGE_KEY, JSON.stringify(arrangementItems));
    } catch (_) {}
  }, [arrangementItems]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SONG_ARRANGEMENT_LIBRARY_STORAGE_KEY,
        JSON.stringify(savedArrangements)
      );
    } catch (_) {}
  }, [savedArrangements]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ARRANGEMENT_BOUNDARY_COMP_SCALE_STORAGE_KEY,
        String(arrangementBoundaryCompScale)
      );
    } catch (_) {}
  }, [arrangementBoundaryCompScale]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ARRANGEMENT_ADAPTIVE_COMP_ENABLED_STORAGE_KEY,
        arrangementAdaptiveCompEnabled ? "1" : "0"
      );
    } catch (_) {}
  }, [arrangementAdaptiveCompEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        LEGACY_SELECTION_ENABLED_STORAGE_KEY,
        legacySelectionEnabled ? "1" : "0"
      );
    } catch (_) {}
  }, [legacySelectionEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        MOVE_MODE_DEBUG_ENABLED_STORAGE_KEY,
        moveModeDebugEnabled ? "1" : "0"
      );
    } catch (_) {}
  }, [moveModeDebugEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STICKING_GUIDE_ENABLED_STORAGE_KEY,
        stickingGuideEnabled ? "1" : "0"
      );
    } catch (_) {}
  }, [stickingGuideEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STICKING_HANDEDNESS_STORAGE_KEY, stickingHandedness);
    } catch (_) {}
  }, [stickingHandedness]);
  useEffect(() => {
    try {
      window.localStorage.setItem(STICKING_LEAD_HAND_STORAGE_KEY, stickingLeadHand);
    } catch (_) {}
  }, [stickingLeadHand]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STICKING_EDIT_MODE_ENABLED_STORAGE_KEY,
        stickingEditModeEnabled ? "1" : "0"
      );
    } catch (_) {}
  }, [stickingEditModeEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STICKING_OVERRIDES_STORAGE_KEY,
        JSON.stringify(stickingOverrides || {})
      );
    } catch (_) {}
  }, [stickingOverrides]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        STICKING_KEEP_QUARTER_LEAD_HAND_STORAGE_KEY,
        stickingKeepQuarterLeadHand ? "1" : "0"
      );
    } catch (_) {}
  }, [stickingKeepQuarterLeadHand]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SHOW_EDITED_STICKING_STORAGE_KEY,
        showEditedSticking ? "1" : "0"
      );
    } catch (_) {}
  }, [showEditedSticking]);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        SHOW_NOTATION_STICKING_STORAGE_KEY,
        showNotationSticking ? "1" : "0"
      );
    } catch (_) {}
  }, [showNotationSticking]);
  useEffect(() => {
    // Notation sticking is the single source of truth for sticking visibility.
    if (stickingGuideEnabled !== showNotationSticking) {
      setStickingGuideEnabled(showNotationSticking);
    }
  }, [showNotationSticking, stickingGuideEnabled]);
  useEffect(() => {
    try {
      window.localStorage.setItem(NOTATION_STICKING_VIEW_STORAGE_KEY, notationStickingView);
    } catch (_) {}
  }, [notationStickingView]);
  useEffect(() => {
    try {
      window.localStorage.setItem(PREFERENCES_CATEGORY_STORAGE_KEY, preferencesCategory);
    } catch (_) {}
  }, [preferencesCategory]);
  useEffect(() => {
    if (isBeatLibraryOpen && !wasBeatLibraryOpenRef.current) {
      setLibraryBpmTarget(bpm);
    }
    wasBeatLibraryOpenRef.current = isBeatLibraryOpen;
  }, [isBeatLibraryOpen, bpm]);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    if (!routeOptions.shareId) {
      setResolvedSharedState(null);
      return;
    }
    if (resolvedSharedState && typeof resolvedSharedState === "object") return;
    let cancelled = false;
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/share/${encodeURIComponent(routeOptions.shareId)}`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        const payload = data?.payload;
        if (payload && typeof payload === "object") setResolvedSharedState(payload);
      } catch (_) {}
    };
    load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [routeOptions.shareId, resolvedSharedState]);

  useEffect(() => {
    return () => {
      if (shareCopiedTimerRef.current) {
        window.clearTimeout(shareCopiedTimerRef.current);
        shareCopiedTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const onViewportChange = () => setMenuViewportTick((t) => t + 1);
    // Run once on mount so small screens can auto-collapse immediately.
    onViewportChange();
    window.addEventListener("resize", onViewportChange);
    window.addEventListener("orientationchange", onViewportChange);
    return () => {
      window.removeEventListener("resize", onViewportChange);
      window.removeEventListener("orientationchange", onViewportChange);
    };
  }, []);

  const rowHasWrapped = React.useCallback((rowEl) => {
    if (!rowEl) return false;
    const children = Array.from(rowEl.children || []).filter(
      (el) => el instanceof HTMLElement && el.offsetParent !== null
    );
    if (children.length <= 1) return false;
    const tops = children.map((child) => child.getBoundingClientRect().top);
    const minTop = Math.min(...tops);
    const maxTop = Math.max(...tops);
    // Allow tiny layout jitter; only treat as wrapped when there's a clear second row.
    return maxTop - minTop > 6;
  }, []);

  useEffect(() => {
    const currentTab = activeTabRef.current;
    if (currentTab === "none") return;
    const rows =
      currentTab === "timing"
        ? [gridMenuRowPrimaryRef.current, gridMenuRowSecondaryRef.current]
        : currentTab === "notation"
          ? [notationMenuRowRef.current]
          : currentTab === "selection"
            ? [selectionMenuRowRef.current]
            : [];
    if (rows.some((row) => rowHasWrapped(row))) {
      setActiveTab("none");
    }
  }, [menuViewportTick, rowHasWrapped]);

  const clampBpm = (n) => Math.min(400, Math.max(20, n));
  const stepBpm = (delta) => setBpm((v) => clampBpm(v + delta));
  const tapTempoTimesRef = React.useRef([]);
  const handleTapTempo = React.useCallback(() => {
    const now = performance.now();
    const prev = tapTempoTimesRef.current;
    if (prev.length > 0 && now - prev[prev.length - 1] > 2000) {
      tapTempoTimesRef.current = [now];
      return;
    }
    const next = [...prev, now].slice(-12);
    tapTempoTimesRef.current = next;
    if (next.length < 3) return;
    let sum = 0;
    for (let i = 1; i < next.length; i++) sum += next[i] - next[i - 1];
    const avgMs = sum / (next.length - 1);
    if (!Number.isFinite(avgMs) || avgMs <= 0) return;
    setBpm(clampBpm(Math.round(60000 / avgMs)));
  }, []);

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
  const stepArrangementBoundaryCompMs = React.useCallback(
    (delta) =>
      setArrangementBoundaryCompScale((v) => Math.max(-40, Math.min(40, v + delta))),
    []
  );
  const arrangementBoundaryCompRepeatRef = React.useRef({ timer: null, interval: null });
  const stopArrangementBoundaryCompRepeat = React.useCallback(() => {
    const r = arrangementBoundaryCompRepeatRef.current;
    if (r.timer) window.clearTimeout(r.timer);
    if (r.interval) window.clearInterval(r.interval);
    r.timer = null;
    r.interval = null;
  }, []);
  const startArrangementBoundaryCompRepeat = React.useCallback(
    (delta) => {
      stopArrangementBoundaryCompRepeat();
      stepArrangementBoundaryCompMs(delta);
      arrangementBoundaryCompRepeatRef.current.timer = window.setTimeout(() => {
        arrangementBoundaryCompRepeatRef.current.interval = window.setInterval(
          () => stepArrangementBoundaryCompMs(delta),
          50
        );
      }, 130);
    },
    [stopArrangementBoundaryCompRepeat, stepArrangementBoundaryCompMs]
  );
  useEffect(
    () => () => stopArrangementBoundaryCompRepeat(),
    [stopArrangementBoundaryCompRepeat]
  );


  const [selection, setSelection] = useState(null);
  const [selectionFinalized, setSelectionFinalized] = useState(0);
  const lastHandledSelectionFinalizedRef = React.useRef(0);
  const tupletBaselineGridRef = React.useRef(null);
  const tupletBaselineSubsByBarRef = React.useRef(null);
  const applyingTupletRemapRef = React.useRef(false);
  const skipSelectionResetRef = React.useRef(0);
  const wrappedMoveCellsRef = React.useRef(null);
  const movePayloadRef = React.useRef(null);
  const moveInitialPayloadRef = React.useRef(null);
  const moveBaseGridRef = React.useRef(null);
  const [wrappedSelectionCells, setWrappedSelectionCells] = useState(null);
  // { rowStart, rowEnd, start, endExclusive } (row indices into active instruments)
  const [loopRule, setLoopRule] = useState(null);


  
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
      if (e.key === "Enter" && selection && !loopRule) {
        const el = e.target;
        const tag = (el?.tagName || "").toLowerCase();
        const isTyping = tag === "input" || tag === "textarea" || el?.isContentEditable;
        if (isTyping) return;
        e.preventDefault();
        setLoopRule(null);
        setSelection(null);
        return;
      }
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
  }, [selection, loopRule, instruments]);

  useEffect(() => {
    if (!selection && !loopRule) return;
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (
        pendingPresetChange ||
        isKitEditorOpen ||
        isBeatLibraryOpen ||
        isArrangementOpen ||
        isArrangementNotationOpen ||
        isPublicSubmitDialogOpen ||
        isShareActionsDialogOpen ||
        isPrintDialogOpen ||
        isMidiDialogOpen ||
        isLegalDialogOpen ||
        isPreferencesDialogOpen
      ) return;
      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || el?.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      setLoopRule(null);
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    selection,
    loopRule,
    pendingPresetChange,
    isKitEditorOpen,
    isBeatLibraryOpen,
    isArrangementOpen,
    isArrangementNotationOpen,
    isPublicSubmitDialogOpen,
    isShareActionsDialogOpen,
    isPrintDialogOpen,
    isMidiDialogOpen,
    isLegalDialogOpen,
    isPreferencesDialogOpen,
  ]);

  useEffect(() => {
    if (!isBeatLibraryOpen) return;
    const panelWidth = 704; // max-w-[44rem]
    const margin = 8;
    const nextX = Math.max(margin, window.innerWidth - panelWidth - margin);
    setBeatLibraryPos((prev) => ({ ...prev, x: nextX }));
    const raf = window.requestAnimationFrame(() => {
      beatNameInputRef.current?.focus();
      beatNameInputRef.current?.select?.();
    });
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsBeatLibraryOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isBeatLibraryOpen]);
  useEffect(() => {
    if (!loadedLocalBeatId) return;
    const stillExists = localBeats.some((b) => String(b?.id || "") === String(loadedLocalBeatId));
    if (!stillExists) setLoadedLocalBeatId(null);
  }, [loadedLocalBeatId, localBeats]);
  useEffect(() => {
    if (!isArrangementOpen) return;
    const margin = 8;
    const nextX = Math.max(margin, window.innerWidth - arrangementPanelWidth - margin);
    setArrangementPos((prev) => ({ ...prev, x: nextX }));
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsArrangementOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isArrangementOpen, arrangementPanelWidth]);
  useEffect(() => {
    if (!isArrangementNotationOpen) return;
    const margin = 8;
    const nextX = margin;
    setArrangementNotationPos((prev) => ({ ...prev, x: nextX }));
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsArrangementNotationOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isArrangementNotationOpen]);
  useEffect(() => {
    if (isBeatLibraryOpen) return;
    setIsPublicSubmitDialogOpen(false);
  }, [isBeatLibraryOpen]);
  useEffect(() => {
    if (!isPublicSubmitDialogOpen) return;
    const raf = window.requestAnimationFrame(() => {
      publicSubmitTitleInputRef.current?.focus();
      publicSubmitTitleInputRef.current?.select?.();
    });
    const onKeyDown = async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsPublicSubmitDialogOpen(false);
        return;
      }
      if (e.key !== "Enter") return;
      const activeEl = document.activeElement;
      if (activeEl === publicSubmitTitleInputRef.current) {
        e.preventDefault();
        if (!lockedPublicComposer) publicSubmitComposerInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPublicSubmitDialogOpen, lockedPublicComposer]);
  useEffect(() => {
    if (!isBeatLibraryOpen) return;
    const onMouseMove = (e) => {
      const drag = beatLibraryDragRef.current;
      if (!drag.dragging) return;
      const width = 704; // max-w-[44rem]
      const panelHeight = beatLibraryPanelRef.current?.offsetHeight || 760;
      const height = Math.min(window.innerHeight - 20, panelHeight);
      const minX = 8;
      const minY = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const maxY = Math.max(minY, window.innerHeight - height - 8);
      const nextX = Math.max(minX, Math.min(maxX, e.clientX - drag.offsetX));
      const nextY = Math.max(minY, Math.min(maxY, e.clientY - drag.offsetY));
      setBeatLibraryPos({ x: nextX, y: nextY });
    };
    const stopDrag = () => {
      beatLibraryDragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, [isBeatLibraryOpen]);
  useEffect(() => {
    if (!isArrangementOpen) return;
    const onMouseMove = (e) => {
      const drag = arrangementDragRef.current;
      if (!drag.dragging) return;
      const width = arrangementPanelWidth;
      const panelHeight = arrangementPanelRef.current?.offsetHeight || 860;
      const height = Math.min(window.innerHeight - 20, panelHeight);
      const minX = 8;
      const minY = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const maxY = Math.max(minY, window.innerHeight - height - 8);
      const nextX = Math.max(minX, Math.min(maxX, e.clientX - drag.offsetX));
      const nextY = Math.max(minY, Math.min(maxY, e.clientY - drag.offsetY));
      setArrangementPos({ x: nextX, y: nextY });
    };
    const stopDrag = () => {
      arrangementDragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, [isArrangementOpen, arrangementPanelWidth]);
  useEffect(() => {
    if (!isArrangementNotationOpen) return;
    const onMouseMove = (e) => {
      const drag = arrangementNotationDragRef.current;
      if (!drag.dragging) return;
      const width = 1040;
      const minX = 8;
      const minY = 8;
      const maxX = Math.max(minX, window.innerWidth - width - 8);
      const nextX = Math.max(minX, Math.min(maxX, e.clientX - drag.offsetX));
      const nextY = Math.max(minY, e.clientY - drag.offsetY);
      setArrangementNotationPos({ x: nextX, y: nextY });
    };
    const stopDrag = () => {
      arrangementNotationDragRef.current.dragging = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopDrag);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", stopDrag);
    };
  }, [isArrangementNotationOpen]);

  useEffect(() => {
    if (!isLegalDialogOpen) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsLegalDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isLegalDialogOpen]);
  useEffect(() => {
    if (!isPreferencesDialogOpen) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsPreferencesDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPreferencesDialogOpen]);

  useEffect(() => {
    if (!isMidiDialogOpen) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setIsMidiDialogOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMidiDialogOpen]);

  
  // Whether new selections should auto-generate a loop.
  const [loopRepeats, setLoopRepeats] = useState("all"); // "off" | "all" | "1".."8"
  const [wrapSelectionMoveEnabled, setWrapSelectionMoveEnabled] = useState(true);
  const [moveOverlapMode, setMoveOverlapMode] = useState("active-to-empty");
  const [loopOverlapMode, setLoopOverlapMode] = useState("all-to-all");
  const [moveOverrideBehavior, setMoveOverrideBehavior] = useState("temporary");
  const lastNonAllLoopRepeats = React.useRef("1");
  const lastNonOffGlobalTupletRef = React.useRef(3);
  React.useEffect(() => {
    // Remember the last non-"all" value so clicking the center can toggle all <-> last value.
    if (loopRepeats !== "all") lastNonAllLoopRepeats.current = loopRepeats;
  }, [loopRepeats]);

  const loopModeEnabled = loopRepeats !== "off" && !stickingEditModeEnabled;

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
    if (selectionFinalized <= 0) return;
    if (selectionFinalized === lastHandledSelectionFinalizedRef.current) return;

    const width = selection.endExclusive - selection.start;
    if (width < 2) return; // keep waiting; selection may still settle for this finalized gesture

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
    lastHandledSelectionFinalizedRef.current = selectionFinalized;
  }, [loopModeEnabled, selectionFinalized, selection]);
useEffect(() => {
    if (loopModeEnabled) return;
    if (loopRule) setLoopRule(null);
  }, [loopModeEnabled, loopRule]);
  useEffect(() => {
    if (!stickingEditModeEnabled) return;
    if (loopRule) setLoopRule(null);
  }, [stickingEditModeEnabled, loopRule]);
// { rowStart, rowEnd, start, length }
  const [mergeRests, setMergeRests] = useState(true);
  const [mergeNotes, setMergeNotes] = useState(true);
  const [dottedNotes, setDottedNotes] = useState(true);
  const [flatBeams, setFlatBeams] = useState(true);
  const [printTitle, setPrintTitle] = useState("");
  const [printComposer, setPrintComposer] = useState("");
  const [printWatermarkEnabled, setPrintWatermarkEnabled] = useState(true);
  const beatNameInputRef = useRef(null);
  const publicSubmitTitleInputRef = useRef(null);
  const publicSubmitComposerInputRef = useRef(null);
  const printTitleInputRef = useRef(null);
  const printComposerInputRef = useRef(null);
// "fast" (>=16ths) | "all"
  useEffect(() => {
    if (!isPrintDialogOpen) return;
    const onKeyDown = async (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsPrintDialogOpen(false);
        return;
      }
      if (e.key !== "Enter") return;

      const activeEl = document.activeElement;
      if (activeEl === printTitleInputRef.current) {
        e.preventDefault();
        printComposerInputRef.current?.focus();
        return;
      }
      if (activeEl === printComposerInputRef.current) {
        e.preventDefault();
        try {
          await exportNotationPdf(notationExportRef.current, {
            title: printTitle.trim() || "Drum Notation",
            scoreTitle: printTitle.trim(),
            composer: printComposer.trim(),
            watermark: printWatermarkEnabled,
          });
          setIsPrintDialogOpen(false);
        } catch (err) {
          console.error(err);
          alert(err?.message || "Failed to export PDF");
        }
        return;
      }
      const tag = (activeEl?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || activeEl?.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      try {
        await exportNotationPdf(notationExportRef.current, {
          title: printTitle.trim() || "Drum Notation",
          scoreTitle: printTitle.trim(),
          composer: printComposer.trim(),
          watermark: printWatermarkEnabled,
        });
        setIsPrintDialogOpen(false);
      } catch (err) {
        console.error(err);
        alert(err?.message || "Failed to export PDF");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPrintDialogOpen, printTitle, printComposer, printWatermarkEnabled]);

  const quarterBeatsPerBar = getQuarterBeatsPerBar(timeSig);
  const baseSubdivPerQuarter = getBaseSubdivPerQuarter(resolution);
  const normalizedTupletOverridesByBar = React.useMemo(() => {
    return Array.from({ length: bars }, (_, barIdx) =>
      Array.from({ length: quarterBeatsPerBar }, (_, qIdx) => {
        const raw = tupletOverridesByBar[barIdx]?.[qIdx];
        return clampTupletValue(raw) ?? null;
      })
    );
  }, [tupletOverridesByBar, bars, quarterBeatsPerBar]);
  const quarterSubdivisionsByBar = React.useMemo(
    () =>
      normalizedTupletOverridesByBar.map((row) =>
        resolveQuarterSubdivisions(row, baseSubdivPerQuarter)
      ),
    [normalizedTupletOverridesByBar, baseSubdivPerQuarter]
  );
  const stepsPerBarByBar = React.useMemo(
    () =>
      quarterSubdivisionsByBar.map((row) =>
        Math.max(1, row.reduce((sum, n) => sum + Math.max(1, Number(n) || 1), 0))
      ),
    [quarterSubdivisionsByBar]
  );
  const barStepOffsets = React.useMemo(() => {
    const out = [0];
    for (let i = 0; i < stepsPerBarByBar.length; i++) out.push(out[i] + stepsPerBarByBar[i]);
    return out;
  }, [stepsPerBarByBar]);
  const stepsPerBar = stepsPerBarByBar[0] ?? Math.max(1, Math.round((timeSig.n * resolution) / timeSig.d));
  const columns = barStepOffsets[barStepOffsets.length - 1] ?? 0;

  useEffect(() => {
    setTupletOverridesByBar((prev) =>
      Array.from({ length: bars }, (_, barIdx) =>
        Array.from({ length: quarterBeatsPerBar }, (_, qIdx) => {
          const raw = prev[barIdx]?.[qIdx];
          return clampTupletValue(raw) ?? null;
        })
      )
    );
  }, [bars, quarterBeatsPerBar]);

  useEffect(() => {
    if (skipSelectionResetRef.current > 0) {
      skipSelectionResetRef.current -= 1;
      return;
    }
    wrappedMoveCellsRef.current = null;
    movePayloadRef.current = null;
    moveInitialPayloadRef.current = null;
    moveBaseGridRef.current = null;
    setWrappedSelectionCells(null);
  }, [selection]);

  useEffect(() => {
    wrappedMoveCellsRef.current = null;
    movePayloadRef.current = null;
    moveInitialPayloadRef.current = null;
    moveBaseGridRef.current = null;
    setWrappedSelectionCells(null);
  }, [moveOverlapMode, moveOverrideBehavior]);

  const moveSelectionByDelta = React.useCallback(
    (dr, dc) => {
      if (!selection) return false;
      const width = selection.endExclusive - selection.start;
      const height = selection.rowEnd - selection.rowStart + 1;
      const rowCount = instruments.length;
      if (rowCount < 1 || columns < 1) return false;
      const sourceRectCoords = Array.from({ length: height }, (_, rOff) =>
        Array.from({ length: width }, (_, cOff) => ({
          row: selection.rowStart + rOff,
          col: selection.start + cOff,
        }))
      ).flat();
      const sourceCoords = wrappedMoveCellsRef.current || sourceRectCoords;
      const outOfBounds = sourceCoords.some(({ row, col }) => {
        const nextRow = row + dr;
        const nextCol = col + dc;
        return nextRow < 0 || nextRow >= rowCount || nextCol < 0 || nextCol >= columns;
      });
      if (outOfBounds && !wrapSelectionMoveEnabled) return false;
      const targetCoords = wrapSelectionMoveEnabled
        ? sourceCoords.map(({ row, col }) => ({
            row: (row + dr + rowCount) % rowCount,
            col: (col + dc + columns) % columns,
          }))
        : sourceCoords.map(({ row, col }) => ({
            row: row + dr,
            col: col + dc,
          }));

      setLoopRule(null);
      setBaseGridWithUndo((prev) => {
        const cloneGrid = (g) => {
          const out = {};
          for (const instId of Object.keys(g)) out[instId] = [...g[instId]];
          return out;
        };
        const isTemporaryOverride = moveOverrideBehavior === "temporary";
        if (isTemporaryOverride && !moveBaseGridRef.current) {
          const base = cloneGrid(prev);
          for (const { row, col } of sourceCoords) {
            const instId = instruments[row]?.id;
            if (!instId) continue;
            base[instId][col] = CELL.OFF;
          }
          moveBaseGridRef.current = base;
        }
        const baseGridForMove = isTemporaryOverride && moveBaseGridRef.current ? moveBaseGridRef.current : prev;
        const next = cloneGrid(baseGridForMove);

        if (!Array.isArray(moveInitialPayloadRef.current) || moveInitialPayloadRef.current.length !== sourceCoords.length) {
          moveInitialPayloadRef.current = sourceCoords.map(({ row, col }) => {
            const instId = instruments[row]?.id;
            if (!instId) return CELL.OFF;
            return prev[instId]?.[col] ?? CELL.OFF;
          });
        }
        const payload = moveInitialPayloadRef.current;

        const ops = targetCoords.map((target, i) => {
          const source = sourceCoords[i];
          const movedVal = payload[i];
          const targetInstId = instruments[target.row]?.id;
          const targetVal = targetInstId ? (baseGridForMove[targetInstId]?.[target.col] ?? CELL.OFF) : CELL.OFF;
          let shouldWrite = true;
          let shouldClearSource = true;

          if (moveOverlapMode === "all-to-all") {
            shouldWrite = true;
            shouldClearSource = true;
          } else if (moveOverlapMode === "active-to-all") {
            shouldWrite = movedVal !== CELL.OFF;
            shouldClearSource = movedVal !== CELL.OFF;
          } else if (moveOverlapMode === "active-to-empty") {
            shouldWrite = movedVal !== CELL.OFF && targetVal === CELL.OFF;
            shouldClearSource = movedVal !== CELL.OFF;
          }

          return { source, target, movedVal, shouldWrite, shouldClearSource };
        });

        if (!isTemporaryOverride) {
          for (const op of ops) {
            if (!op.shouldClearSource) continue;
            const instId = instruments[op.source.row]?.id;
            if (!instId) continue;
            next[instId][op.source.col] = CELL.OFF;
          }
        }

        for (const op of ops) {
          const targetInstId = instruments[op.target.row]?.id;
          if (!targetInstId) continue;
          if (!op.shouldWrite) continue;
          next[targetInstId][op.target.col] = op.movedVal;
        }

        return next;
      });
      movePayloadRef.current = moveInitialPayloadRef.current;
      if (moveOverrideBehavior !== "temporary") moveBaseGridRef.current = null;
      wrappedMoveCellsRef.current = targetCoords;
      setWrappedSelectionCells(targetCoords);
      return true;
    },
    [selection, instruments, columns, wrapSelectionMoveEnabled, moveOverlapMode, moveOverrideBehavior]
  );
  useEffect(() => {
    if (!selection) return;
    const onKey = (e) => {
      const deltaByKey = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      const delta = deltaByKey[e.key];
      if (!delta) return;
      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || el?.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      moveSelectionByDelta(delta[0], delta[1]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selection, moveSelectionByDelta]);

  const clearAll = React.useCallback(() => {
    const currentGrid = baseGridRef.current || {};
    const isAlreadyEmpty = ALL_INSTRUMENTS.every((inst) =>
      (currentGrid[inst.id] || []).every((v) => v === CELL.OFF)
    );
    if (isAlreadyEmpty) {
      const hasAnyTuplet = normalizedTupletOverridesByBar.some((row) => row.some((v) => v != null));
      if (hasAnyTuplet) {
        setTupletOverridesByBar(
          Array.from({ length: bars }, () => Array.from({ length: quarterBeatsPerBar }, () => null))
        );
      }
      tupletBaselineGridRef.current = null;
      tupletBaselineSubsByBarRef.current = null;
      return;
    }
    setBaseGridWithUndo(() => {
      const g = {};
      ALL_INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(CELL.OFF)));
      return g;
    });
    setSelection(null);
    setLoopRule(null);
  }, [normalizedTupletOverridesByBar, bars, quarterBeatsPerBar, columns]);

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

  const rankCell = React.useCallback((v) => (v === CELL.ACCENT ? 3 : v === CELL.ON ? 2 : v === CELL.GHOST ? 1 : 0), []);
  const cloneGridState = React.useCallback((g) => {
    const out = {};
    ALL_INSTRUMENTS.forEach((inst) => {
      out[inst.id] = [...(g?.[inst.id] || [])];
    });
    return out;
  }, []);

  const remapGridBySubdivisions = React.useCallback(
    (prevGrid, oldSubsByBar, newSubsByBar) => {
      const oldStepsByBar = oldSubsByBar.map((subs) => buildStepMeta(subs));
      const newStepsByBar = newSubsByBar.map((subs) => buildStepMeta(subs));
      const oldOffsets = [0];
      for (let i = 0; i < oldStepsByBar.length; i++) oldOffsets.push(oldOffsets[i] + oldStepsByBar[i].length);
      const newOffsets = [0];
      for (let i = 0; i < newStepsByBar.length; i++) newOffsets.push(newOffsets[i] + newStepsByBar[i].length);
      const out = {};
      ALL_INSTRUMENTS.forEach((inst) => {
        const row = Array(newOffsets[newOffsets.length - 1] || 0).fill(CELL.OFF);
        for (let b = 0; b < Math.min(oldStepsByBar.length, newStepsByBar.length); b++) {
          const oldMeta = oldStepsByBar[b];
          const newMeta = newStepsByBar[b];
          const oldStart = oldOffsets[b];
          const newStart = newOffsets[b];
          const oldQuarterCount = Math.max(1, oldSubsByBar[b]?.length || 0);
          const newQuarterCount = Math.max(1, newSubsByBar[b]?.length || 0);
          const quarterCount = Math.min(oldQuarterCount, newQuarterCount);

          for (let q = 0; q < quarterCount; q++) {
            const events = [];
            for (let oldStep = 0; oldStep < oldMeta.length; oldStep++) {
              const m = oldMeta[oldStep];
              if (!m || m.quarterIndex !== q) continue;
              const oldGlobal = oldStart + oldStep;
              const val = prevGrid[inst.id]?.[oldGlobal] ?? CELL.OFF;
              if (val === CELL.OFF) continue;
              const subdiv = Math.max(1, m.subdiv || 1);
              events.push({
                phase: m.subIndex / subdiv,
                val,
                srcSub: m.subIndex,
              });
            }
            if (!events.length) continue;
            events.sort((a, b) => (a.phase - b.phase) || (a.srcSub - b.srcSub));

            const newSubdiv = Math.max(1, Number(newSubsByBar[b]?.[q]) || 1);
            const slots = assignPhasesToSlots(events.map((e) => e.phase), newSubdiv);

            for (let i = 0; i < events.length; i++) {
              const targetSub = Math.max(0, Math.min(newSubdiv - 1, slots[i]));
              const mappedIdx = newMeta.findIndex(
                (m) => m?.quarterIndex === q && m?.subIndex === targetSub
              );
              if (mappedIdx < 0) continue;
              const nextGlobal = newStart + mappedIdx;
              const cur = row[nextGlobal] ?? CELL.OFF;
              row[nextGlobal] = rankCell(events[i].val) >= rankCell(cur) ? events[i].val : cur;
            }
          }
        }
        out[inst.id] = row;
      });
      return out;
    },
    [rankCell]
  );

  const handleResolutionChange = (newRes) => {
    tupletBaselineGridRef.current = null;
    tupletBaselineSubsByBarRef.current = null;
    const oldSubsByBar = quarterSubdivisionsByBar;
    const nextBase = getBaseSubdivPerQuarter(newRes);
    // Keep explicit tuplet values stable across resolution changes.
    // Example: triplet (3) should remain triplet when switching 8th <-> 16th.
    const nextOverridesByBar = normalizedTupletOverridesByBar.map((row) => row.map((v) => v));
    const nextSubsByBar = nextOverridesByBar.map((row) =>
      resolveQuarterSubdivisions(row, nextBase)
    );

    if (keepTiming) {
      setBaseGridWithUndo((prev) => remapGridBySubdivisions(prev, oldSubsByBar, nextSubsByBar));
    }
    setTupletOverridesByBar(nextOverridesByBar);
    setResolution(newRes);
  };

  const handleTimeSigChange = (newTS) => {
    tupletBaselineGridRef.current = null;
    tupletBaselineSubsByBarRef.current = null;
    const oldSubsByBar = quarterSubdivisionsByBar;
    const nextQuarterCount = getQuarterBeatsPerBar(newTS);
    const nextOverridesByBar = Array.from({ length: bars }, (_, barIdx) =>
      Array.from({ length: nextQuarterCount }, (_, idx) =>
        clampTupletValue(normalizedTupletOverridesByBar[barIdx]?.[idx]) ?? null
      )
    );
    const nextBase = getBaseSubdivPerQuarter(resolution);
    const nextSubsByBar = nextOverridesByBar.map((row) =>
      resolveQuarterSubdivisions(row, nextBase)
    );
    if (keepTiming) {
      setBaseGridWithUndo((prev) => remapGridBySubdivisions(prev, oldSubsByBar, nextSubsByBar));
    }
    setTupletOverridesByBar(nextOverridesByBar);
    setTimeSig(newTS);
  };

  const cycleTupletAt = React.useCallback(
    (barIdx, beatIdx, dir = 1) => {
      if (barIdx < 0 || barIdx >= bars) return;
      if (beatIdx < 0 || beatIdx >= quarterBeatsPerBar) return;
      const oldSubsByBar = quarterSubdivisionsByBar;
      const current = normalizedTupletOverridesByBar[barIdx]?.[beatIdx] ?? null;
      const idx = TUPLET_OPTIONS.findIndex((v) => v === current);
      const nextIdx = idx < 0 ? 0 : (idx + dir + TUPLET_OPTIONS.length) % TUPLET_OPTIONS.length;
      const nextVal = TUPLET_OPTIONS[nextIdx];
      const nextOverridesByBar = normalizedTupletOverridesByBar.map((row) => [...row]);
      nextOverridesByBar[barIdx][beatIdx] = nextVal;
      const nextSubsByBar = nextOverridesByBar.map((row) =>
        resolveQuarterSubdivisions(row, baseSubdivPerQuarter)
      );
      if (keepTiming) {
        applyingTupletRemapRef.current = true;
        setBaseGridWithUndo((prev) => {
          if (!tupletBaselineGridRef.current || !tupletBaselineSubsByBarRef.current) {
            tupletBaselineGridRef.current = cloneGridState(prev);
            tupletBaselineSubsByBarRef.current = oldSubsByBar.map((row) => [...row]);
          }
          return remapGridBySubdivisions(
            tupletBaselineGridRef.current,
            tupletBaselineSubsByBarRef.current,
            nextSubsByBar
          );
        });
      } else {
        tupletBaselineGridRef.current = null;
        tupletBaselineSubsByBarRef.current = null;
      }
      setTupletOverridesByBar(nextOverridesByBar);
    },
    [
      bars,
      quarterBeatsPerBar,
      quarterSubdivisionsByBar,
      normalizedTupletOverridesByBar,
      baseSubdivPerQuarter,
      keepTiming,
      cloneGridState,
      remapGridBySubdivisions,
    ]
  );
  const globalTupletValue = React.useMemo(() => {
    const values = normalizedTupletOverridesByBar.flatMap((row) => row.map((v) => v ?? null));
    if (values.length === 0) return null;
    const first = values[0] ?? null;
    return values.every((v) => (v ?? null) === first) ? first : "mixed";
  }, [normalizedTupletOverridesByBar]);
  React.useEffect(() => {
    if (typeof globalTupletValue === "number" && globalTupletValue > 0) {
      lastNonOffGlobalTupletRef.current = globalTupletValue;
    }
  }, [globalTupletValue]);
  const setGlobalTupletValue = React.useCallback(
    (nextVal) => {
      const normalized = clampTupletValue(nextVal) ?? null;
      const oldSubsByBar = quarterSubdivisionsByBar;
      const nextOverridesByBar = Array.from({ length: bars }, () =>
        Array.from({ length: quarterBeatsPerBar }, () => normalized)
      );
      const nextSubsByBar = nextOverridesByBar.map((row) =>
        resolveQuarterSubdivisions(row, baseSubdivPerQuarter)
      );
      if (keepTiming) {
        applyingTupletRemapRef.current = true;
        setBaseGridWithUndo((prev) => remapGridBySubdivisions(prev, oldSubsByBar, nextSubsByBar));
      } else {
        tupletBaselineGridRef.current = null;
        tupletBaselineSubsByBarRef.current = null;
      }
      setTupletOverridesByBar(nextOverridesByBar);
    },
    [
      quarterSubdivisionsByBar,
      bars,
      quarterBeatsPerBar,
      baseSubdivPerQuarter,
      keepTiming,
      remapGridBySubdivisions,
    ]
  );
  const stepGlobalTupletValue = React.useCallback(
    (dir = 1) => {
      const idx = TUPLET_OPTIONS.findIndex((v) => v === globalTupletValue);
      const startIdx = idx < 0 ? 0 : idx;
      const nextIdx = (startIdx + dir + TUPLET_OPTIONS.length) % TUPLET_OPTIONS.length;
      setGlobalTupletValue(TUPLET_OPTIONS[nextIdx]);
    },
    [globalTupletValue, setGlobalTupletValue]
  );
  const toggleGlobalTupletOffLast = React.useCallback(() => {
    if (globalTupletValue == null) {
      setGlobalTupletValue(lastNonOffGlobalTupletRef.current || 3);
      return;
    }
    if (typeof globalTupletValue === "number" && globalTupletValue > 0) {
      lastNonOffGlobalTupletRef.current = globalTupletValue;
      setGlobalTupletValue(null);
      return;
    }
    // Mixed -> off, then next click returns to last remembered value.
    setGlobalTupletValue(null);
  }, [globalTupletValue, setGlobalTupletValue]);



  const [baseGrid, setBaseGrid] = useState(() => {
    const g = {};
    ALL_INSTRUMENTS.forEach((i) => (g[i.id] = Array(columns).fill(CELL.OFF)));
    return g;
  });

  
  // Grid-only undo/redo (minimal): tracks baseGrid snapshots only.
  const [gridPast, setGridPast] = useState([]);
  const [gridFuture, setGridFuture] = useState([]);

  const localBeatsRef = React.useRef(localBeats);
  const arrangementItemsRef = React.useRef(arrangementItems);
  const savedArrangementsRef = React.useRef(savedArrangements);
  const arrangementNameDraftRef = React.useRef(arrangementNameDraft);
  const loadedArrangementIdRef = React.useRef(loadedArrangementId);
  const loadedLocalBeatIdRef = React.useRef(loadedLocalBeatId);
  const beatNameDraftRef = React.useRef(beatNameDraft);
  const beatCategoryDraftRef = React.useRef(beatCategoryDraft);
  const beatStyleDraftRef = React.useRef(beatStyleDraft);
  const localBeatPastRef = React.useRef([]);
  const localBeatFutureRef = React.useRef([]);
  const gridPastRef = React.useRef([]);
  const gridFutureRef = React.useRef([]);
  const baseGridRef = React.useRef(null);
  const tupletOverridesRef = React.useRef(tupletOverridesByBar);

  React.useEffect(() => {
    localBeatsRef.current = localBeats;
  }, [localBeats]);
  React.useEffect(() => {
    arrangementItemsRef.current = arrangementItems;
  }, [arrangementItems]);
  React.useEffect(() => {
    savedArrangementsRef.current = savedArrangements;
  }, [savedArrangements]);
  React.useEffect(() => {
    arrangementNameDraftRef.current = arrangementNameDraft;
  }, [arrangementNameDraft]);
  React.useEffect(() => {
    loadedArrangementIdRef.current = loadedArrangementId;
  }, [loadedArrangementId]);
  React.useEffect(() => {
    loadedLocalBeatIdRef.current = loadedLocalBeatId;
  }, [loadedLocalBeatId]);
  React.useEffect(() => {
    beatNameDraftRef.current = beatNameDraft;
  }, [beatNameDraft]);
  React.useEffect(() => {
    beatCategoryDraftRef.current = beatCategoryDraft;
  }, [beatCategoryDraft]);
  React.useEffect(() => {
    beatStyleDraftRef.current = beatStyleDraft;
  }, [beatStyleDraft]);

  React.useEffect(() => {
    baseGridRef.current = baseGrid;
  }, [baseGrid]);
  React.useEffect(() => {
    tupletOverridesRef.current = tupletOverridesByBar;
  }, [tupletOverridesByBar]);

  React.useEffect(() => {
    if (applyingTupletRemapRef.current) {
      applyingTupletRemapRef.current = false;
      return;
    }
    // Any non-tuplet grid edit ends the tuplet-cycling compare session.
    tupletBaselineGridRef.current = null;
    tupletBaselineSubsByBarRef.current = null;
  }, [baseGrid]);
  useEffect(() => {
    setStickingOverrides((prev) => {
      const entries = Object.entries(prev || {});
      if (!entries.length) return prev;
      let changed = false;
      const next = {};
      for (const [key, hand] of entries) {
        const parts = key.split(":");
        if (parts.length !== 2) {
          changed = true;
          continue;
        }
        const [instId, idxRaw] = parts;
        const idx = Number(idxRaw);
        if (!Number.isInteger(idx) || idx < 0 || idx >= columns) {
          changed = true;
          continue;
        }
        if (FOOT_INSTRUMENTS.has(instId)) {
          changed = true;
          continue;
        }
        if ((baseGrid[instId]?.[idx] ?? CELL.OFF) === CELL.OFF) {
          changed = true;
          continue;
        }
        if (hand !== "L" && hand !== "R") {
          changed = true;
          continue;
        }
        next[key] = hand;
      }
      return changed ? next : prev;
    });
  }, [baseGrid, columns]);

  const snapshotGrid = React.useCallback((g) => {
    const snap = {};
    ALL_INSTRUMENTS.forEach((i) => {
      snap[i.id] = [...(g?.[i.id] || [])];
    });
    return snap;
  }, []);
  const snapshotTuplets = React.useCallback((t) => {
    return (t || []).map((row) => [...row]);
  }, []);
  const snapshotEditorState = React.useCallback(
    (gridState, tupletState) => ({
      grid: snapshotGrid(gridState),
      tuplets: snapshotTuplets(tupletState),
    }),
    [snapshotGrid, snapshotTuplets]
  );

  const syncHistoryState = React.useCallback(() => {
    setGridPast([...gridPastRef.current]);
    setGridFuture([...gridFutureRef.current]);
  }, []);

  const pushGridHistory = React.useCallback(() => {
    gridPastRef.current = [
      ...gridPastRef.current,
      snapshotEditorState(baseGridRef.current, tupletOverridesRef.current),
    ];
    // clear redo stack on new edit
    gridFutureRef.current = [];
    // optional cap to keep memory bounded
    if (gridPastRef.current.length > 200) {
      gridPastRef.current = gridPastRef.current.slice(gridPastRef.current.length - 200);
    }
    syncHistoryState();
  }, [snapshotEditorState, syncHistoryState]);

  const undoGrid = React.useCallback(() => {
    if (gridPastRef.current.length === 0) return;
    const prev = gridPastRef.current[gridPastRef.current.length - 1];
    gridPastRef.current = gridPastRef.current.slice(0, -1);
    gridFutureRef.current = [
      snapshotEditorState(baseGridRef.current, tupletOverridesRef.current),
      ...gridFutureRef.current,
    ];
    setBaseGrid(prev?.grid || {});
    if (Array.isArray(prev?.tuplets)) setTupletOverridesByBar(prev.tuplets);
    syncHistoryState();
  }, [snapshotEditorState, syncHistoryState]);

  const redoGrid = React.useCallback(() => {
    if (gridFutureRef.current.length === 0) return;
    const next = gridFutureRef.current[0];
    gridFutureRef.current = gridFutureRef.current.slice(1);
    gridPastRef.current = [
      ...gridPastRef.current,
      snapshotEditorState(baseGridRef.current, tupletOverridesRef.current),
    ];
    setBaseGrid(next?.grid || {});
    if (Array.isArray(next?.tuplets)) setTupletOverridesByBar(next.tuplets);
    syncHistoryState();
  }, [snapshotEditorState, syncHistoryState]);

  const setBaseGridWithUndo = React.useCallback(
    (updater) => {
      pushGridHistory();
      setBaseGrid(updater);
    },
    [pushGridHistory]
  );

  const cloneLocalBeatList = React.useCallback((beats) => {
    if (!Array.isArray(beats)) return [];
    return beats.map((beat) => {
      try {
        return structuredClone(beat);
      } catch (_) {
        try {
          return JSON.parse(JSON.stringify(beat));
        } catch (_) {
          return beat;
        }
      }
    });
  }, []);
  const cloneSavedArrangementList = React.useCallback((items) => {
    if (!Array.isArray(items)) return [];
    return items.map((entry) => {
      try {
        return structuredClone(entry);
      } catch (_) {
        try {
          return JSON.parse(JSON.stringify(entry));
        } catch (_) {
          return entry;
        }
      }
    });
  }, []);
  const snapshotLibraryState = React.useCallback(() => {
    return {
      localBeats: cloneLocalBeatList(localBeatsRef.current),
      arrangementItems: normalizeArrangementItems(arrangementItemsRef.current),
      savedArrangements: cloneSavedArrangementList(savedArrangementsRef.current),
      arrangementNameDraft: String(arrangementNameDraftRef.current || ""),
      loadedArrangementId: loadedArrangementIdRef.current || null,
      loadedLocalBeatId: loadedLocalBeatIdRef.current || null,
      beatNameDraft: String(beatNameDraftRef.current || ""),
      beatCategoryDraft: String(beatCategoryDraftRef.current || "all"),
      beatStyleDraft: String(beatStyleDraftRef.current || "all"),
    };
  }, [cloneLocalBeatList, cloneSavedArrangementList]);
  const applyLibraryState = React.useCallback((snapshot) => {
    if (!snapshot || typeof snapshot !== "object") return;
    const nextLocalBeats = cloneLocalBeatList(snapshot.localBeats);
    const nextArrangementItems = normalizeArrangementItems(snapshot.arrangementItems);
    const nextSavedArrangements = cloneSavedArrangementList(snapshot.savedArrangements);
    localBeatsRef.current = nextLocalBeats;
    arrangementItemsRef.current = nextArrangementItems;
    savedArrangementsRef.current = nextSavedArrangements;
    loadedArrangementIdRef.current = snapshot.loadedArrangementId || null;
    loadedLocalBeatIdRef.current = snapshot.loadedLocalBeatId || null;
    arrangementNameDraftRef.current = String(snapshot.arrangementNameDraft || "");
    beatNameDraftRef.current = String(snapshot.beatNameDraft || "");
    beatCategoryDraftRef.current = String(snapshot.beatCategoryDraft || "all");
    beatStyleDraftRef.current = String(snapshot.beatStyleDraft || "all");
    setLocalBeats(nextLocalBeats);
    setArrangementItems(nextArrangementItems);
    setSavedArrangements(nextSavedArrangements);
    setLoadedArrangementId(snapshot.loadedArrangementId || null);
    setLoadedLocalBeatId(snapshot.loadedLocalBeatId || null);
    setArrangementNameDraft(String(snapshot.arrangementNameDraft || ""));
    setBeatNameDraft(String(snapshot.beatNameDraft || ""));
    setBeatCategoryDraft(String(snapshot.beatCategoryDraft || "all"));
    setBeatStyleDraft(String(snapshot.beatStyleDraft || "all"));
  }, [cloneLocalBeatList, cloneSavedArrangementList]);

  const syncLocalBeatHistoryState = React.useCallback(() => {
    setLocalBeatPast([...localBeatPastRef.current]);
    setLocalBeatFuture([...localBeatFutureRef.current]);
  }, []);

  const pushLocalBeatHistory = React.useCallback(() => {
    localBeatPastRef.current = [
      ...localBeatPastRef.current,
      snapshotLibraryState(),
    ];
    localBeatFutureRef.current = [];
    if (localBeatPastRef.current.length > 200) {
      localBeatPastRef.current = localBeatPastRef.current.slice(localBeatPastRef.current.length - 200);
    }
    syncLocalBeatHistoryState();
  }, [snapshotLibraryState, syncLocalBeatHistoryState]);

  const setLocalBeatsWithUndo = React.useCallback(
    (updater) => {
      pushLocalBeatHistory();
      setLocalBeats((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const normalized = Array.isArray(next) ? next : [];
        localBeatsRef.current = normalized;
        return normalized;
      });
    },
    [pushLocalBeatHistory]
  );

  const undoLocalBeatHistory = React.useCallback(() => {
    if (localBeatPastRef.current.length === 0) return;
    const prev = localBeatPastRef.current[localBeatPastRef.current.length - 1];
    localBeatPastRef.current = localBeatPastRef.current.slice(0, -1);
    localBeatFutureRef.current = [
      snapshotLibraryState(),
      ...localBeatFutureRef.current,
    ];
    applyLibraryState(prev);
    syncLocalBeatHistoryState();
  }, [snapshotLibraryState, applyLibraryState, syncLocalBeatHistoryState]);

  const redoLocalBeatHistory = React.useCallback(() => {
    if (localBeatFutureRef.current.length === 0) return;
    const next = localBeatFutureRef.current[0];
    localBeatFutureRef.current = localBeatFutureRef.current.slice(1);
    localBeatPastRef.current = [
      ...localBeatPastRef.current,
      snapshotLibraryState(),
    ];
    applyLibraryState(next);
    syncLocalBeatHistoryState();
  }, [snapshotLibraryState, applyLibraryState, syncLocalBeatHistoryState]);
  const setArrangementItemsWithUndo = React.useCallback(
    (updater) => {
      pushLocalBeatHistory();
      setArrangementItems((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        const normalized = normalizeArrangementItems(next);
        arrangementItemsRef.current = normalized;
        return normalized;
      });
    },
    [pushLocalBeatHistory]
  );

  useEffect(() => {
    const tupletsMatchFor = (overridesByBar) =>
      overridesByBar.every((row, barIdx) =>
        row.every(
          (val, qIdx) =>
            (normalizedTupletOverridesByBar[barIdx]?.[qIdx] ?? null) === (val ?? null)
        )
      );

    const shared = pendingSharedLoadRef.current;
    if (shared) {
      if (bars !== shared.bars) return;
      if (resolution !== shared.resolution) return;
      if (timeSig.n !== shared.timeSig.n || timeSig.d !== shared.timeSig.d) return;
      if (!tupletsMatchFor(shared.tupletsByBar)) return;

      const nextGrid = {};
      ALL_INSTRUMENTS.forEach((inst) => {
        nextGrid[inst.id] = Array(columns).fill(CELL.OFF);
      });

      Object.entries(shared.grid || {}).forEach(([instId, events]) => {
        if (!INSTRUMENT_BY_ID[instId] || !Array.isArray(events)) return;
        events.forEach((event) => {
          if (!Array.isArray(event) || event.length < 2) return;
          const idx = Number(event[0]);
          const code = Number(event[1]);
          if (!Number.isFinite(idx) || idx < 0 || idx >= columns) return;
          const nextVal = code === 3 ? CELL.ACCENT : code === 2 ? CELL.GHOST : code === 1 ? CELL.ON : CELL.OFF;
          if (nextVal !== CELL.OFF) nextGrid[instId][Math.floor(idx)] = nextVal;
        });
      });

      gridPastRef.current = [];
      gridFutureRef.current = [];
      setBaseGrid(nextGrid);
      syncHistoryState();
      pendingSharedLoadRef.current = null;
      return;
    }

    const example = pendingExampleLoadRef.current;
    if (!example) return;
    if (bars !== example.bars) return;
    if (resolution !== example.resolution) return;
    if (timeSig.n !== example.timeSig.n || timeSig.d !== example.timeSig.d) return;
    if (!tupletsMatchFor(example.tupletsByBar)) return;

    const rank = (v) => (v === CELL.ACCENT ? 3 : v === CELL.ON ? 2 : v === CELL.GHOST ? 1 : 0);
    const nextGrid = {};
    ALL_INSTRUMENTS.forEach((inst) => {
      nextGrid[inst.id] = Array(columns).fill(CELL.OFF);
    });

    const placeHit = (instId, barIdx, pos, value = CELL.ON) => {
      if (!INSTRUMENT_BY_ID[instId]) return;
      if (barIdx < 0 || barIdx >= bars) return;
      const stepsInBar = stepsPerBarByBar[barIdx] || 0;
      if (stepsInBar < 1) return;
      const normalizedPos = Math.max(0, Math.min(0.999999, Number(pos) || 0));
      const stepInBar = Math.max(
        0,
        Math.min(stepsInBar - 1, Math.round(normalizedPos * stepsInBar))
      );
      const globalStep = (barStepOffsets[barIdx] || 0) + stepInBar;
      const current = nextGrid[instId][globalStep] ?? CELL.OFF;
      if (rank(value) >= rank(current)) nextGrid[instId][globalStep] = value;
    };

    for (const hit of example.hits || []) {
      const targetBars =
        hit.bars === "all"
          ? Array.from({ length: bars }, (_, idx) => idx)
          : Array.isArray(hit.bars)
            ? hit.bars
            : [0];
      for (const barIdx of targetBars) {
        for (const pos of hit.positions || []) {
          placeHit(hit.instId, barIdx, pos, hit.value || CELL.ON);
        }
      }
    }

    gridPastRef.current = [];
    gridFutureRef.current = [];
    setBaseGrid(nextGrid);
    syncHistoryState();
    pendingExampleLoadRef.current = null;
  }, [
    bars,
    resolution,
    timeSig,
    columns,
    barStepOffsets,
    stepsPerBarByBar,
    normalizedTupletOverridesByBar,
    syncHistoryState,
  ]);

  const arraysEqual = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  useEffect(() => {
    try {
      window.localStorage.setItem(USER_PRESETS_STORAGE_KEY, JSON.stringify(savedPresets));
    } catch (_) {}
  }, [savedPresets]);
  useEffect(() => {
    try {
      window.localStorage.setItem(LOCAL_BEAT_LIBRARY_STORAGE_KEY, JSON.stringify(localBeats));
    } catch (_) {}
  }, [localBeats]);

  const getPresetIds = React.useCallback(
    (presetName) => {
      if (DRUMKIT_PRESETS[presetName]) return DRUMKIT_PRESETS[presetName];
      const saved = savedPresets.find((p) => p.id === presetName);
      return saved?.ids || null;
    },
    [savedPresets]
  );
  const getPresetLabel = React.useCallback(
    (presetName) => {
      if (PRESET_LABELS[presetName]) return PRESET_LABELS[presetName];
      const saved = savedPresets.find((p) => p.id === presetName);
      return saved?.label || presetName;
    },
    [savedPresets]
  );
  useEffect(() => {
    if (routeOptions.shared || routeOptions.shareId) return;
    if (!requestedExample) return;
    if (appliedExampleIdRef.current === requestedExample.id) return;

    const nextBars = Math.max(1, Number(requestedExample.bars) || 1);
    const nextTimeSig = requestedExample.timeSig || { n: 4, d: 4 };
    const quarterCount = getQuarterBeatsPerBar(nextTimeSig);
    const defaultTuplets = Array.from({ length: nextBars }, () =>
      Array.from({ length: quarterCount }, () => null)
    );
    const tupletsByBar = Array.from({ length: nextBars }, (_, barIdx) =>
      Array.from({ length: quarterCount }, (_, qIdx) => {
        const raw = requestedExample.tupletsByBar?.[barIdx]?.[qIdx];
        return clampTupletValue(raw) ?? null;
      })
    );
    const nextKitIds =
      requestedExample.kitIds ||
      getPresetIds(requestedExample.preset) ||
      DRUMKIT_PRESETS.standard;

    pendingExampleLoadRef.current = {
      ...requestedExample,
      bars: nextBars,
      resolution: Math.max(4, Number(requestedExample.resolution) || 8),
      timeSig: nextTimeSig,
      tupletsByBar: tupletsByBar.length ? tupletsByBar : defaultTuplets,
    };
    appliedExampleIdRef.current = requestedExample.id;

    setModifiedPresetBase(null);
    setPendingPresetChange(null);
    setPendingRemoval(null);
    setSelection(null);
    setLoopRule(null);
    setActiveTab("none");
    setLoopRepeats("off");
    setKitInstrumentIds([...nextKitIds]);
    setBars(nextBars);
    setResolution(Math.max(4, Number(requestedExample.resolution) || 8));
    setTimeSig(nextTimeSig);
    setTupletOverridesByBar(tupletsByBar);
  }, [requestedExample, getPresetIds, routeOptions.shared, routeOptions.shareId]);

  const makeUniquePresetId = React.useCallback(
    (label) => {
      const slug = String(label)
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      let base = slug || "preset";
      if (DRUMKIT_PRESETS[base]) base = `user-${base}`;
      const exists = (id) => !!DRUMKIT_PRESETS[id] || savedPresets.some((p) => p.id === id);
      let id = base;
      let n = 2;
      while (exists(id)) {
        id = `${base}-${n}`;
        n += 1;
      }
      return id;
    },
    [savedPresets]
  );

  const mergeMissingPresetTracks = React.useCallback((keptIds, targetIds) => {
    const next = [...keptIds];

    targetIds.forEach((targetId, targetIdx) => {
      if (next.includes(targetId)) return;

      let insertAt = -1;

      // Prefer inserting after the nearest previous preset track that already exists.
      for (let i = targetIdx - 1; i >= 0; i--) {
        const prevId = targetIds[i];
        const idx = next.indexOf(prevId);
        if (idx !== -1) {
          insertAt = idx + 1;
          break;
        }
      }

      // Otherwise insert before the nearest next preset track that already exists.
      if (insertAt === -1) {
        for (let i = targetIdx + 1; i < targetIds.length; i++) {
          const nextId = targetIds[i];
          const idx = next.indexOf(nextId);
          if (idx !== -1) {
            insertAt = idx;
            break;
          }
        }
      }

      // If no anchors exist yet, append (preserves non-preset kept tracks).
      if (insertAt === -1) insertAt = next.length;
      next.splice(insertAt, 0, targetId);
    });

    return next;
  }, []);

  const allPresetIds = React.useMemo(
    () => [...BUILTIN_PRESET_ORDER, ...savedPresets.map((p) => p.id)],
    [savedPresets]
  );
  const selectedPreset =
    allPresetIds.find((presetName) => {
      const ids = getPresetIds(presetName);
      return ids && arraysEqual(kitInstrumentIds, ids);
    }) || null;

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

  const applyManualKitIds = React.useCallback(
    (nextIds) => {
      setModifiedPresetBase(selectedPreset || modifiedPresetBase || null);
      applyKitIds(nextIds);
    },
    [applyKitIds, selectedPreset, modifiedPresetBase]
  );

  const hasNotesOnTrack = React.useCallback(
    (instId) => (baseGrid[instId] || []).some((v) => v !== CELL.OFF),
    [baseGrid]
  );

  const computePresetTransition = React.useCallback(
    (presetName) => {
      const targetIds = getPresetIds(presetName);
      if (!targetIds) return null;

      const removedIds = kitInstrumentIds.filter((id) => !targetIds.includes(id));
      const removedWithNotes = removedIds.filter((id) => hasNotesOnTrack(id));
      const removedSet = new Set(
        kitInstrumentIds.filter(
          (id) => !targetIds.includes(id) && !removedWithNotes.includes(id)
        )
      );
      const keptIds = kitInstrumentIds.filter((id) => !removedSet.has(id));
      const mergedKeepNoted = mergeMissingPresetTracks(keptIds, targetIds);

      return { targetIds, removedWithNotes, mergedKeepNoted };
    },
    [kitInstrumentIds, hasNotesOnTrack, mergeMissingPresetTracks, getPresetIds]
  );

  const requestPresetChange = React.useCallback(
    (presetName) => {
      const transition = computePresetTransition(presetName);
      if (!transition) return;
      const { targetIds, removedWithNotes, mergedKeepNoted } = transition;

      if (removedWithNotes.length === 0) {
        setModifiedPresetBase(null);
        applyKitIds(targetIds);
        return;
      }

      if (showPresetChangeWarningEnabled) {
        setPendingPresetChange({ presetName, targetIds, removedWithNotes });
        return;
      }

      if (keepTracksWithNotesEnabled) {
        // Keep noted tracks automatically.
        setModifiedPresetBase(presetName);
        applyKitIds(mergedKeepNoted);
        return;
      }

      // Both toggles off: remove noted tracks immediately.
      setModifiedPresetBase(null);
      applyKitIds(targetIds);
    },
    [computePresetTransition, applyKitIds, showPresetChangeWarningEnabled, keepTracksWithNotesEnabled]
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

    // Preserve kept tracks, then place missing preset tracks by preset order anchors.
    const keptIds = kitInstrumentIds.filter((id) => !removedSet.has(id));
    const merged = mergeMissingPresetTracks(keptIds, pendingPresetChange.targetIds);

    setModifiedPresetBase(pendingPresetChange.presetName);
    applyKitIds(merged);
  }, [pendingPresetChange, kitInstrumentIds, applyKitIds, mergeMissingPresetTracks]);

  const confirmPresetDeleteAnyway = React.useCallback(() => {
    if (!pendingPresetChange) return;
    setModifiedPresetBase(null);
    applyKitIds(pendingPresetChange.targetIds);
  }, [pendingPresetChange, applyKitIds]);

  useEffect(() => {
    if (!pendingPresetChange) return;
    const onKeyDown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (keepTracksWithNotesEnabled) confirmPresetKeepNotedTracks();
        else confirmPresetDeleteAnyway();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setPendingPresetChange(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pendingPresetChange, confirmPresetKeepNotedTracks, confirmPresetDeleteAnyway, keepTracksWithNotesEnabled]);

  useEffect(() => {
    if (!isKitEditorOpen) return;
    if (pendingPresetChange) return;
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (isSaveAsDialogOpen) {
        setIsSaveAsDialogOpen(false);
        setSaveAsName("");
        return;
      }
      setIsKitEditorOpen(false);
      setPendingRemoval(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isKitEditorOpen, pendingPresetChange, isSaveAsDialogOpen]);

  const presetOrder = allPresetIds;
  const stepperPresetAnchor =
    selectedPreset ||
    (modifiedPresetBase && presetOrder.includes(modifiedPresetBase) ? modifiedPresetBase : presetOrder[0]);
  const stepPreset = React.useCallback(
    (delta) => {
      const i = presetOrder.indexOf(stepperPresetAnchor);
      if (i === -1) {
        const fallback = delta >= 0 ? BUILTIN_PRESET_ORDER[0] : BUILTIN_PRESET_ORDER[BUILTIN_PRESET_ORDER.length - 1];
        requestPresetChange(fallback);
        return;
      }

      const dir = delta >= 0 ? 1 : -1;
      for (let step = 1; step <= presetOrder.length; step++) {
        const next = presetOrder[(i + dir * step + presetOrder.length) % presetOrder.length];
        if (!showPresetChangeWarningEnabled) {
          const transition = computePresetTransition(next);
          if (!transition) continue;
          const preview = transition.removedWithNotes.length > 0
            ? (keepTracksWithNotesEnabled ? transition.mergedKeepNoted : transition.targetIds)
            : transition.targetIds;
          if (arraysEqual(preview, kitInstrumentIds)) continue;
        }
        requestPresetChange(next);
        return;
      }
    },
    [
      stepperPresetAnchor,
      presetOrder,
      requestPresetChange,
      computePresetTransition,
      showPresetChangeWarningEnabled,
      keepTracksWithNotesEnabled,
      kitInstrumentIds,
    ]
  );

  const selectedPresetLabel =
    selectedPreset
      ? getPresetLabel(selectedPreset)
      : modifiedPresetBase
        ? `${getPresetLabel(modifiedPresetBase)}*`
        : "Modified";
  const selectedSavedPreset =
    selectedPreset ? savedPresets.find((p) => p.id === selectedPreset) || null : null;
  const getBeatBpm = React.useCallback((beat) => {
    const direct = Number(beat?.bpm);
    if (Number.isFinite(direct) && direct >= 20 && direct <= 400) return Math.round(direct);
    const payloadBpm = Number(beat?.payload?.bpm);
    if (Number.isFinite(payloadBpm) && payloadBpm >= 20 && payloadBpm <= 400) return Math.round(payloadBpm);
    return null;
  }, []);
  const bpmPassesLibraryFilter = React.useCallback(
    (beatBpm) => {
      if (libraryBpmFilterMode === "any") return true;
      if (!Number.isFinite(beatBpm)) return false;
      if (libraryBpmFilterMode === "exact") return beatBpm === libraryBpmTarget;
      if (libraryBpmFilterMode === "pm5") return Math.abs(beatBpm - libraryBpmTarget) <= 5;
      if (libraryBpmFilterMode === "pm10") return Math.abs(beatBpm - libraryBpmTarget) <= 10;
      return true;
    },
    [libraryBpmFilterMode, libraryBpmTarget]
  );
  const getLibrarySortLabel = React.useCallback(
    (sortMode) => LIBRARY_SORT_MODES.find((m) => m.id === sortMode)?.label || "Upload date: newest",
    []
  );
  const cycleLibrarySort = React.useCallback(() => {
    setLibrarySort((prev) => {
      const idx = LIBRARY_SORT_MODES.findIndex((m) => m.id === prev);
      const nextIdx = idx < 0 ? 0 : (idx + 1) % LIBRARY_SORT_MODES.length;
      return LIBRARY_SORT_MODES[nextIdx].id;
    });
  }, []);
  const cycleLibraryBpmFilterMode = React.useCallback(() => {
    setLibraryBpmFilterMode((prev) => {
      const idx = LIBRARY_BPM_FILTER_MODES.findIndex((m) => m.id === prev);
      const nextIdx = idx < 0 ? 0 : (idx + 1) % LIBRARY_BPM_FILTER_MODES.length;
      return LIBRARY_BPM_FILTER_MODES[nextIdx].id;
    });
  }, []);
  const libraryBpmValues = React.useMemo(() => {
    const source = beatLibraryTab === "public" ? publicBeats : localBeats;
    const values = source
      .map((beat) => getBeatBpm(beat))
      .filter((v) => Number.isFinite(v))
      .map((v) => Math.round(v));
    return Array.from(new Set(values)).sort((a, b) => a - b);
  }, [beatLibraryTab, publicBeats, localBeats, getBeatBpm]);
  const stepLibraryBpmTarget = React.useCallback(
    (delta) => {
      const direction = delta >= 0 ? 1 : -1;
      const values = libraryBpmValues;
      if (!values.length) return;
      setLibraryBpmTarget((prev) => {
        if (direction > 0) {
          const higher = values.find((v) => v > prev);
          return higher ?? values[values.length - 1];
        }
        for (let i = values.length - 1; i >= 0; i--) {
          if (values[i] < prev) return values[i];
        }
        return values[0];
      });
    },
    [libraryBpmValues]
  );
  const getBpmFilterLabel = React.useCallback(() => {
    if (libraryBpmFilterMode === "any") return "Any";
    if (libraryBpmFilterMode === "exact") return `${libraryBpmTarget}`;
    if (libraryBpmFilterMode === "pm5") return `${libraryBpmTarget}±5`;
    if (libraryBpmFilterMode === "pm10") return `${libraryBpmTarget}±10`;
    return "Any";
  }, [libraryBpmFilterMode, libraryBpmTarget]);
  const libraryBpmRepeatRef = React.useRef({ timer: null, interval: null });
  const stopLibraryBpmRepeat = React.useCallback(() => {
    const r = libraryBpmRepeatRef.current;
    if (r.timer) window.clearTimeout(r.timer);
    if (r.interval) window.clearInterval(r.interval);
    r.timer = null;
    r.interval = null;
  }, []);
  const startLibraryBpmRepeat = React.useCallback(
    (delta) => {
      stopLibraryBpmRepeat();
      stepLibraryBpmTarget(delta);
      libraryBpmRepeatRef.current.timer = window.setTimeout(() => {
        libraryBpmRepeatRef.current.interval = window.setInterval(
          () => stepLibraryBpmTarget(delta),
          50
        );
      }, 130);
    },
    [stopLibraryBpmRepeat, stepLibraryBpmTarget]
  );
  useEffect(() => () => stopLibraryBpmRepeat(), [stopLibraryBpmRepeat]);
  const allTimeSigCategories = React.useMemo(() => {
    const fromLocal = localBeats.map((b) => String(b?.timeSigCategory || "")).filter(Boolean);
    const fromPublic = publicBeats.map((b) => String(b?.timeSigCategory || "")).filter(Boolean);
    return Array.from(new Set([...fromLocal, ...fromPublic])).sort();
  }, [localBeats, publicBeats]);
  const filteredLocalBeats = React.useMemo(() => {
    const list = localBeats.filter((beat) => {
      if (libraryTimeSigFilter !== "all" && beat?.timeSigCategory !== libraryTimeSigFilter) return false;
      if (beatStyleDraft !== "all" && String(beat?.style || "") !== beatStyleDraft) return false;
      if (beatCategoryDraft !== "all" && String(beat?.category || "") !== beatCategoryDraft) return false;
      if (!bpmPassesLibraryFilter(getBeatBpm(beat))) return false;
      return true;
    });
    const byTime = (a, b) =>
      new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
    const byBpm = (a, b) => (getBeatBpm(a) ?? -1) - (getBeatBpm(b) ?? -1);
    return [...list].sort((a, b) => {
      if (librarySort === "oldest") return byTime(a, b);
      if (librarySort === "bpm-asc") return byBpm(a, b);
      if (librarySort === "bpm-desc") return byBpm(b, a);
      return byTime(b, a);
    });
  }, [
    localBeats,
    libraryTimeSigFilter,
    beatStyleDraft,
    beatCategoryDraft,
    librarySort,
    getBeatBpm,
    bpmPassesLibraryFilter,
  ]);
  const filteredPublicBeats = React.useMemo(() => {
    const list = publicBeats.filter((beat) => {
      if (libraryTimeSigFilter !== "all" && beat?.timeSigCategory !== libraryTimeSigFilter) return false;
      if (beatStyleDraft !== "all" && String(beat?.style || "") !== beatStyleDraft) return false;
      if (beatCategoryDraft !== "all" && String(beat?.category || "") !== beatCategoryDraft) return false;
      if (!bpmPassesLibraryFilter(getBeatBpm(beat))) return false;
      return true;
    });
    const byTime = (a, b) =>
      new Date(a?.createdAt || 0).getTime() - new Date(b?.createdAt || 0).getTime();
    const byBpm = (a, b) => (getBeatBpm(a) ?? -1) - (getBeatBpm(b) ?? -1);
    return [...list].sort((a, b) => {
      if (librarySort === "oldest") return byTime(a, b);
      if (librarySort === "bpm-asc") return byBpm(a, b);
      if (librarySort === "bpm-desc") return byBpm(b, a);
      return byTime(b, a);
    });
  }, [
    publicBeats,
    libraryTimeSigFilter,
    beatStyleDraft,
    beatCategoryDraft,
    librarySort,
    getBeatBpm,
    bpmPassesLibraryFilter,
  ]);
  const getBeatBySourceRef = React.useCallback(
    (source, beatId) => {
      const list = source === "public" ? publicBeats : localBeats;
      return list.find((b) => String(b?.id || "") === String(beatId || "")) || null;
    },
    [publicBeats, localBeats]
  );
  const arrangementRows = React.useMemo(() => {
    return arrangementItems.map((item) => {
      const beat = getBeatBySourceRef(item.source, item.beatId);
      const beatBars = Math.max(1, Number(beat?.payload?.bars) || 1);
      const beatTimeSig = beat?.timeSigCategory || "4/4";
      const beatBpm = getBeatBpm(beat);
      const [nRaw, dRaw] = String(beatTimeSig).split("/");
      const n = Math.max(1, Number(nRaw) || 4);
      const d = Math.max(1, Number(dRaw) || 4);
      const barSeconds = beatBpm ? (60 / beatBpm) * ((n * 4) / d) : 0;
      return {
        ...item,
        beat,
        beatBars,
        beatTimeSig,
        beatBpm,
        sectionBars: beatBars * item.repeats,
        sectionSeconds: barSeconds * beatBars * item.repeats,
      };
    });
  }, [arrangementItems, getBeatBySourceRef, getBeatBpm]);
  const arrangementNotationSections = React.useMemo(() => {
    const out = [];
    let globalBarOffset = 0;
    let prevBpm = null;
    arrangementRows.forEach((row, idx) => {
      const baseNotationState = buildNotationStateFromPayload(row?.beat?.payload);
      const notationState = expandNotationStateForRepeats(baseNotationState, row?.repeats);
      if (!notationState) return;
      const stickingAssignments = computeStickingAssignmentsForNotationState(notationState, {
        stickingHandedness,
        stickingLeadHand,
        stickingKeepQuarterLeadHand,
      });
      const bpmNum = Number.isFinite(row?.beatBpm) ? Math.round(Number(row.beatBpm)) : null;
      const showTempoAtStart = bpmNum != null && (globalBarOffset === 0 || prevBpm !== bpmNum);
      out.push({
        id: row.id || `${idx}`,
        index: idx,
        name: row?.beat?.name || "Untitled Beat",
        repeats: Math.max(1, Number(row?.repeats) || 1),
        beatBars: Math.max(1, Number(row?.beatBars) || 1),
        sectionBars: Math.max(1, Number(row?.sectionBars) || 1),
        beatTimeSig: row?.beatTimeSig || "4/4",
        beatBpm: row?.beatBpm,
        notation: notationState,
        stickingAssignments,
        startBarOffset: globalBarOffset,
        sectionMarkers: [{ bar: 0, text: row?.beat?.name || "Untitled Beat" }],
        tempoMarkers: showTempoAtStart ? [{ bar: 0, text: `♩ = ${bpmNum}` }] : [],
      });
      globalBarOffset += Math.max(1, Number(row?.sectionBars) || 1);
      prevBpm = bpmNum;
    });
    return out;
  }, [arrangementRows, stickingHandedness, stickingLeadHand, stickingKeepQuarterLeadHand]);
  const arrangementNotationSheetChunks = React.useMemo(() => {
    const chunks = [];
    let current = [];
    let currentKey = "";
    let currentStartBarOffset = 0;
    let barCursor = 0;
    arrangementNotationSections.forEach((section) => {
      const ts = section?.notation?.timeSig || {};
      const key = `${Number(section?.notation?.resolution) || 0}:${Number(ts.n) || 0}/${Number(ts.d) || 0}`;
      if (!current.length || key === currentKey) {
        if (!current.length) currentStartBarOffset = barCursor;
        current.push(section);
        currentKey = key;
        barCursor += Math.max(1, Number(section?.sectionBars) || 1);
        return;
      }
      const merged = mergeNotationStates(current.map((s) => s.notation));
      if (merged) {
        const sectionMarkers = [];
        const tempoMarkers = [];
        current.forEach((s) => {
          const localBar = Math.max(0, (s.startBarOffset || 0) - currentStartBarOffset);
          (s.sectionMarkers || []).forEach((m) => {
            sectionMarkers.push({ bar: localBar + (Number(m?.bar) || 0), text: String(m?.text || "") });
          });
          (s.tempoMarkers || []).forEach((m) => {
            tempoMarkers.push({ bar: localBar + (Number(m?.bar) || 0), text: String(m?.text || "") });
          });
        });
        chunks.push({
          ...merged,
          startBarOffset: currentStartBarOffset,
          sectionMarkers,
          tempoMarkers,
          stickingAssignments: computeStickingAssignmentsForNotationState(merged, {
            stickingHandedness,
            stickingLeadHand,
            stickingKeepQuarterLeadHand,
          }),
        });
      }
      current = [section];
      currentKey = key;
      currentStartBarOffset = barCursor;
      barCursor += Math.max(1, Number(section?.sectionBars) || 1);
    });
    if (current.length) {
      const merged = mergeNotationStates(current.map((s) => s.notation));
      if (merged) {
        const sectionMarkers = [];
        const tempoMarkers = [];
        current.forEach((s) => {
          const localBar = Math.max(0, (s.startBarOffset || 0) - currentStartBarOffset);
          (s.sectionMarkers || []).forEach((m) => {
            sectionMarkers.push({ bar: localBar + (Number(m?.bar) || 0), text: String(m?.text || "") });
          });
          (s.tempoMarkers || []).forEach((m) => {
            tempoMarkers.push({ bar: localBar + (Number(m?.bar) || 0), text: String(m?.text || "") });
          });
        });
        chunks.push({
          ...merged,
          startBarOffset: currentStartBarOffset,
          sectionMarkers,
          tempoMarkers,
          stickingAssignments: computeStickingAssignmentsForNotationState(merged, {
            stickingHandedness,
            stickingLeadHand,
            stickingKeepQuarterLeadHand,
          }),
        });
      }
    }
    return chunks;
  }, [arrangementNotationSections, stickingHandedness, stickingLeadHand, stickingKeepQuarterLeadHand]);
  const arrangementPlayableEntries = React.useMemo(() => {
    const out = [];
    arrangementRows.forEach((row, rowIndex) => {
      if (!row?.beat?.payload) return;
      const count = Math.max(1, Number(row.repeats) || 1);
      for (let i = 0; i < count; i++) out.push({ rowIndex, row, repeatIndex: i });
    });
    return out;
  }, [arrangementRows]);
  const normalizedArrangementSelection = React.useMemo(() => {
    if (!arrangementSelection) return null;
    const start = Math.max(0, Math.min(arrangementSelection.start, arrangementSelection.end));
    const end = Math.max(0, Math.max(arrangementSelection.start, arrangementSelection.end));
    if (start >= arrangementRows.length || end >= arrangementRows.length) return null;
    return { start, end };
  }, [arrangementSelection, arrangementRows.length]);
  const activeArrangementPlayingRowIndex = React.useMemo(() => {
    const entry = arrangementPlayableEntries[arrangementPlaybackIndex];
    return Number.isFinite(entry?.rowIndex) ? entry.rowIndex : -1;
  }, [arrangementPlayableEntries, arrangementPlaybackIndex]);
  const arrangementTotals = React.useMemo(() => {
    const totalBars = arrangementRows.reduce((sum, row) => sum + row.sectionBars, 0);
    const totalSeconds = arrangementRows.reduce((sum, row) => sum + row.sectionSeconds, 0);
    return { totalBars, totalSeconds };
  }, [arrangementRows]);
  const arrangementAddBeat = React.useCallback((source, beatId) => {
    setArrangementItemsWithUndo((prev) => {
      const normalizedSource = source === "public" ? "public" : "local";
      const normalizedBeatId = String(beatId);
      const last = prev[prev.length - 1];
      if (
        last &&
        last.source === normalizedSource &&
        String(last.beatId) === normalizedBeatId
      ) {
        return prev.map((row, idx) =>
          idx === prev.length - 1
            ? { ...row, repeats: Math.max(1, Math.min(64, (Number(row.repeats) || 1) + 1)) }
            : row
        );
      }
      return [
        ...prev,
        {
          id: `arr-${Math.random().toString(36).slice(2, 10)}`,
          source: normalizedSource,
          beatId: normalizedBeatId,
          repeats: 1,
        },
      ];
    });
  }, [setArrangementItemsWithUndo]);
  const arrangementMoveRow = React.useCallback((rowId, delta) => {
    setArrangementItemsWithUndo((prev) => {
      const idx = prev.findIndex((row) => row.id === rowId);
      if (idx < 0) return prev;
      const nextIdx = idx + delta;
      if (nextIdx < 0 || nextIdx >= prev.length) return prev;
      const out = [...prev];
      const [row] = out.splice(idx, 1);
      out.splice(nextIdx, 0, row);
      return out;
    });
  }, [setArrangementItemsWithUndo]);
  const arrangementNudgeRepeats = React.useCallback((rowId, delta) => {
    setArrangementItemsWithUndo((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? { ...row, repeats: Math.max(1, Math.min(64, (Number(row.repeats) || 1) + delta)) }
          : row
      )
    );
  }, [setArrangementItemsWithUndo]);
  const arrangementRemoveRow = React.useCallback((rowId) => {
    setArrangementItemsWithUndo((prev) => prev.filter((row) => row.id !== rowId));
  }, [setArrangementItemsWithUndo]);
  const saveArrangementSnapshot = React.useCallback(() => {
    const normalizedItems = normalizeArrangementItems(arrangementItems);
    if (!normalizedItems.length) return;
    const now = new Date().toISOString();
    const trimmed = arrangementNameDraft.trim();
    const fallbackName = `Arrangement ${savedArrangements.length + 1}`;
    const name = trimmed || fallbackName;
    const lower = name.toLowerCase();
    const byId = loadedArrangementId
      ? savedArrangements.find((entry) => entry.id === loadedArrangementId)
      : null;
    const byName = savedArrangements.find((entry) => entry.name.toLowerCase() === lower);
    const target = byId || byName || null;
    const nextId = target?.id || `arrlib-${Math.random().toString(36).slice(2, 10)}`;
    const nextEntry = {
      id: nextId,
      name,
      createdAt: target?.createdAt || now,
      updatedAt: now,
      items: normalizedItems,
    };
    pushLocalBeatHistory();
    setSavedArrangements((prev) => {
      const idx = prev.findIndex((entry) => entry.id === nextId);
      if (idx < 0) return [nextEntry, ...prev];
      const out = [...prev];
      out[idx] = nextEntry;
      return out;
    });
    setArrangementNameDraft(name);
    setLoadedArrangementId(nextId);
  }, [arrangementItems, arrangementNameDraft, savedArrangements, loadedArrangementId, pushLocalBeatHistory]);
  const loadSavedArrangement = React.useCallback(
    (entry) => {
      if (!entry || !Array.isArray(entry.items) || entry.items.length < 1) return;
      if (arrangementPlaybackEnabled) {
        setArrangementPlaybackEnabled(false);
        setArrangementPlaybackIndex(0);
      }
      pushLocalBeatHistory();
      setArrangementItems(normalizeArrangementItems(entry.items));
      setArrangementSelection(null);
      setArrangementSelectionAnchor(null);
      setArrangementNameDraft(String(entry.name || ""));
      setLoadedArrangementId(entry.id || null);
    },
    [arrangementPlaybackEnabled, pushLocalBeatHistory]
  );
  const deleteSavedArrangement = React.useCallback((entryId) => {
    pushLocalBeatHistory();
    setSavedArrangements((prev) => prev.filter((entry) => entry.id !== entryId));
    setLoadedArrangementId((prev) => (prev === entryId ? null : prev));
  }, [pushLocalBeatHistory]);
  const handleArrangementRowSelect = React.useCallback((rowIndex) => {
    if (!Number.isFinite(rowIndex) || rowIndex < 0) return;
    const sel = normalizedArrangementSelection;
    if (!sel) {
      setArrangementSelectionAnchor(rowIndex);
      setArrangementSelection({ start: rowIndex, end: rowIndex });
      return;
    }
    const { start, end } = sel;
    const isInside = rowIndex >= start && rowIndex <= end;
    if (isInside) {
      if (start === end && rowIndex === start) {
        setArrangementSelection(null);
        setArrangementSelectionAnchor(null);
        return;
      }
      if (rowIndex === start) {
        setArrangementSelectionAnchor(start + 1);
        setArrangementSelection({ start: start + 1, end });
        return;
      }
      if (rowIndex === end) {
        setArrangementSelectionAnchor(start);
        setArrangementSelection({ start, end: end - 1 });
        return;
      }
      // Middle click would split the range; restart from this row to keep selection contiguous.
      setArrangementSelectionAnchor(rowIndex);
      setArrangementSelection({ start: rowIndex, end: rowIndex });
      return;
    }
    // Clicking outside grows the contiguous block to the clicked row.
    if (rowIndex < start) {
      setArrangementSelectionAnchor(end);
      setArrangementSelection({ start: rowIndex, end });
      return;
    }
    if (rowIndex > end) {
      setArrangementSelectionAnchor(start);
      setArrangementSelection({ start, end: rowIndex });
      return;
    }
    setArrangementSelectionAnchor(rowIndex);
    setArrangementSelection({ start: rowIndex, end: rowIndex });
  }, [normalizedArrangementSelection]);
  const selectedSavedArrangementEntry = React.useMemo(() => {
    if (!savedArrangements.length) return null;
    if (loadedArrangementId) {
      return savedArrangements.find((entry) => entry.id === loadedArrangementId) || null;
    }
    return savedArrangements[0] || null;
  }, [savedArrangements, loadedArrangementId]);
  const arrangementSourceBeats =
    arrangementSourceTab === "public" ? filteredPublicBeats : filteredLocalBeats;
  const openBeatLibraryWindow = React.useCallback(() => {
    setArrangementSourceTab("local");
    setArrangementSourcesCollapsed(false);
    setArrangementDetailsCollapsed(true);
    setIsArrangementOpen((v) => !v);
  }, []);
  const openArrangementWindow = React.useCallback(() => {
    setIsArrangementOpen((v) => !v);
  }, []);
  useEffect(() => {
    if (!arrangementSelection) return;
    if (!arrangementRows.length) {
      setArrangementSelection(null);
      setArrangementSelectionAnchor(null);
      return;
    }
    const maxRow = arrangementRows.length - 1;
    if (arrangementSelection.start > maxRow || arrangementSelection.end > maxRow) {
      setArrangementSelection(null);
      setArrangementSelectionAnchor(null);
    }
  }, [arrangementRows.length, arrangementSelection]);
  const isLibraryHistoryActive = isArrangementOpen || (isBeatLibraryOpen && beatLibraryTab === "local");
  const canUndoTop = isLibraryHistoryActive ? localBeatPast.length > 0 : gridPast.length > 0;
  const canRedoTop = isLibraryHistoryActive ? localBeatFuture.length > 0 : gridFuture.length > 0;
  const handleTopUndo = React.useCallback(() => {
    if (isLibraryHistoryActive) {
      undoLocalBeatHistory();
      return;
    }
    undoGrid();
  }, [isLibraryHistoryActive, undoLocalBeatHistory, undoGrid]);
  const handleTopRedo = React.useCallback(() => {
    if (isLibraryHistoryActive) {
      redoLocalBeatHistory();
      return;
    }
    redoGrid();
  }, [isLibraryHistoryActive, redoLocalBeatHistory, redoGrid]);

  useEffect(() => {
    setPresetNameInlineDraft(selectedSavedPreset ? selectedSavedPreset.label : selectedPresetLabel);
  }, [selectedSavedPreset, selectedPresetLabel]);
  const savePresetAsNew = React.useCallback(() => {
    const label = saveAsName.trim();
    if (!label) return;
    const id = makeUniquePresetId(label);
    setSavedPresets((prev) => [...prev, { id, label, ids: [...kitInstrumentIds] }]);
    setModifiedPresetBase(null);
    setSaveAsName("");
    setIsSaveAsDialogOpen(false);
  }, [saveAsName, makeUniquePresetId, kitInstrumentIds]);
  const renameSelectedPresetInline = React.useCallback(() => {
    if (!selectedSavedPreset) return;
    const label = presetNameInlineDraft.trim();
    if (!label) return;
    setSavedPresets((prev) =>
      prev.map((p) => (p.id === selectedSavedPreset.id ? { ...p, label } : p))
    );
  }, [selectedSavedPreset, presetNameInlineDraft]);
  const deleteSelectedPreset = React.useCallback(() => {
    if (!selectedSavedPreset) return;
    const deletingId = selectedSavedPreset.id;
    setSavedPresets((prev) => prev.filter((p) => p.id !== deletingId));
    if (modifiedPresetBase === deletingId) setModifiedPresetBase(null);
  }, [selectedSavedPreset, modifiedPresetBase]);

  const requestRemoveInstrument = React.useCallback(
    (instId) => {
      if (!kitInstrumentIds.includes(instId)) return;
      if (!hasNotesOnTrack(instId)) {
        applyManualKitIds(kitInstrumentIds.filter((id) => id !== instId));
        return;
      }
      const moveTargetId = kitInstrumentIds.find((id) => id !== instId) || null;
      setPendingRemoval({ instId, moveTargetId });
    },
    [kitInstrumentIds, hasNotesOnTrack, applyManualKitIds]
  );

  const confirmRemoveDeleteNotes = React.useCallback(() => {
    if (!pendingRemoval?.instId) return;
    const instId = pendingRemoval.instId;
    setBaseGridWithUndo((prev) => ({
      ...prev,
      [instId]: Array(columns).fill(CELL.OFF),
    }));
    applyManualKitIds(kitInstrumentIds.filter((id) => id !== instId));
  }, [pendingRemoval, columns, setBaseGridWithUndo, applyManualKitIds, kitInstrumentIds]);

  const confirmRemoveMoveNotes = React.useCallback(() => {
    if (!pendingRemoval?.instId || !pendingRemoval?.moveTargetId) return;
    const srcId = pendingRemoval.instId;
    const dstId = pendingRemoval.moveTargetId;
    if (srcId === dstId) return;

    setBaseGridWithUndo((prev) => {
      const next = { ...prev };
      const src = [...(prev[srcId] || Array(columns).fill(CELL.OFF))];
      const dst = [...(prev[dstId] || Array(columns).fill(CELL.OFF))];
      const rank = (v) => (v === CELL.ACCENT ? 3 : v === CELL.ON ? 2 : v === CELL.GHOST ? 1 : 0);
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

    applyManualKitIds(kitInstrumentIds.filter((id) => id !== srcId));
  }, [pendingRemoval, setBaseGridWithUndo, columns, applyManualKitIds, kitInstrumentIds]);

  const toggleInstrumentInKit = React.useCallback(
    (instId, enable) => {
      if (enable) {
        if (kitInstrumentIds.includes(instId)) return;
        const fullOrder = DRUMKIT_PRESETS.full;
        const newFullIdx = fullOrder.indexOf(instId);
        if (newFullIdx === -1) {
          applyManualKitIds([...kitInstrumentIds, instId]);
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
        applyManualKitIds(next);
        return;
      }
      requestRemoveInstrument(instId);
    },
    [kitInstrumentIds, applyManualKitIds, requestRemoveInstrument]
  );

  const moveInstrument = React.useCallback(
    (instId, dir) => {
      const idx = kitInstrumentIds.indexOf(instId);
      if (idx < 0) return;
      const to = idx + dir;
      if (to < 0 || to >= kitInstrumentIds.length) return;
      const next = [...kitInstrumentIds];
      [next[idx], next[to]] = [next[to], next[idx]];
      applyManualKitIds(next);
    },
    [kitInstrumentIds, applyManualKitIds]
  );
  const kitOrderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );
  const onKitOrderDragEnd = React.useCallback(
    (event) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = kitInstrumentIds.indexOf(String(active.id));
      const newIndex = kitInstrumentIds.indexOf(String(over.id));
      if (oldIndex < 0 || newIndex < 0) return;
      applyManualKitIds(arrayMove(kitInstrumentIds, oldIndex, newIndex));
    },
    [kitInstrumentIds, applyManualKitIds]
  );
  const restrictKitDragToList = React.useCallback(({ transform, activeNodeRect }) => {
    const listEl = kitOrderListRef.current;
    if (!listEl || !transform || !activeNodeRect) {
      return transform ? { ...transform, x: 0 } : transform;
    }
    const listRect = listEl.getBoundingClientRect();
    const minY = listRect.top - activeNodeRect.top;
    const maxY = listRect.bottom - activeNodeRect.bottom;
    return {
      ...transform,
      x: 0,
      y: Math.max(minY, Math.min(maxY, transform.y)),
    };
  }, []);
  const arrangementOrderSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );
  const onArrangementOrderDragEnd = React.useCallback((event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setArrangementItemsWithUndo((prev) => {
      const oldIndex = prev.findIndex((row) => row.id === String(active.id));
      const newIndex = prev.findIndex((row) => row.id === String(over.id));
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [setArrangementItemsWithUndo]);
  const restrictArrangementDragToList = React.useCallback(({ transform, activeNodeRect }) => {
    const listEl = arrangementListRef.current;
    if (!listEl || !transform || !activeNodeRect) {
      return transform ? { ...transform, x: 0 } : transform;
    }
    const listRect = listEl.getBoundingClientRect();
    const minY = listRect.top - activeNodeRect.top;
    const maxY = listRect.bottom - activeNodeRect.bottom;
    return {
      ...transform,
      x: 0,
      y: Math.max(minY, Math.min(maxY, transform.y)),
    };
  }, []);


  const bakeLoopInto = (prevGrid, rule, repeats = "all", overlapMode = "all-to-all") => {
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
        const movedVal = srcByRow[instId]?.[i] ?? CELL.OFF;
        const targetVal = next[instId]?.[idx] ?? CELL.OFF;
        if (overlapMode === "all-to-all") {
          next[instId][idx] = movedVal;
          continue;
        }
        if (overlapMode === "active-to-all") {
          if (movedVal !== CELL.OFF) next[instId][idx] = movedVal;
          continue;
        }
        if (overlapMode === "active-to-empty") {
          if (movedVal !== CELL.OFF && targetVal === CELL.OFF) next[instId][idx] = movedVal;
          continue;
        }
      }
    }
    return next;
  };

  useEffect(() => {
    if (!loopRule) return;
    const onKey = (e) => {
      if (e.key !== "Enter") return;
      if (pendingPresetChange || isKitEditorOpen || isArrangementOpen || isPublicSubmitDialogOpen || isShareActionsDialogOpen || isPrintDialogOpen || isMidiDialogOpen) return;
      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      const isTyping = tag === "input" || tag === "textarea" || el?.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
      setLoopRule(null);
      setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    loopRule,
    loopRepeats,
    loopOverlapMode,
    pendingPresetChange,
    isKitEditorOpen,
    isArrangementOpen,
    isPublicSubmitDialogOpen,
    isShareActionsDialogOpen,
    isPrintDialogOpen,
    isMidiDialogOpen,
  ]);

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
        const movedVal = srcByRow[instId]?.[i] ?? CELL.OFF;
        const targetVal = g[instId]?.[idx] ?? CELL.OFF;
        if (loopOverlapMode === "all-to-all") {
          g[instId][idx] = movedVal;
          continue;
        }
        if (loopOverlapMode === "active-to-all") {
          if (movedVal !== CELL.OFF) g[instId][idx] = movedVal;
          continue;
        }
        if (loopOverlapMode === "active-to-empty") {
          if (movedVal !== CELL.OFF && targetVal === CELL.OFF) g[instId][idx] = movedVal;
          continue;
        }
      }
    }
    return g;
  }, [baseGrid, loopRule, columns, loopRepeats, loopOverlapMode, instruments]);
  const quarterDownbeatStepSet = React.useMemo(() => {
    const out = new Set();
    const byBar = Array.isArray(quarterSubdivisionsByBar) ? quarterSubdivisionsByBar : [];
    for (let b = 0; b < byBar.length; b++) {
      const barOffset = barStepOffsets?.[b] ?? 0;
      const row = Array.isArray(byBar[b]) ? byBar[b] : [];
      let acc = 0;
      for (let q = 0; q < row.length; q++) {
        out.add(barOffset + acc);
        acc += Math.max(1, Number(row[q]) || 1);
      }
    }
    return out;
  }, [quarterSubdivisionsByBar, barStepOffsets]);
  const stepStartQuarterTimes = React.useMemo(() => {
    const out = Array(columns).fill(0);
    const byBar = Array.isArray(quarterSubdivisionsByBar) ? quarterSubdivisionsByBar : [];
    for (let b = 0; b < byBar.length; b++) {
      const barOffset = barStepOffsets?.[b] ?? 0;
      const row = Array.isArray(byBar[b]) ? byBar[b] : [];
      let localStep = 0;
      let t = 0;
      for (let q = 0; q < row.length; q++) {
        const subdiv = Math.max(1, Number(row[q]) || 1);
        const dur = 1 / subdiv;
        for (let s = 0; s < subdiv; s++) {
          const idx = barOffset + localStep;
          if (idx >= 0 && idx < columns) out[idx] = t;
          localStep += 1;
          t += dur;
        }
      }
    }
    return out;
  }, [quarterSubdivisionsByBar, barStepOffsets, columns]);
  const autoStickingAssignmentsByStep = React.useMemo(() => {
    const handIds = instruments.map((inst) => inst.id).filter((id) => !FOOT_INSTRUMENTS.has(id));
    const lead = stickingLeadHand === "left" ? "L" : "R";
    const favoredHand = stickingHandedness === "left" ? "L" : "R";
    const rightFavorIds = new Set(["ride", "rideBell"]);
    const alternationIds = new Set([
      "hihat",
      "hihatOpen",
      "snare",
      "tom1",
      "tom2",
      "floorTom",
      "crash1",
      "crash2",
    ]);
    const isCrashLike = (id) => id === "crash1" || id === "crash2";
    const historyKeyFor = (id) => (isCrashLike(id) ? "__crash_pair__" : id);
    const handPos = {
      L: stickingHandedness === "left" ? 2.6 : 1.4,
      R: stickingHandedness === "left" ? 1.4 : 2.6,
    };
    const canAlternateAtSpacing = (spacingQuarter) => {
      if (!Number.isFinite(spacingQuarter)) return false;
      return stickingKeepQuarterLeadHand ? spacingQuarter < 1 : spacingQuarter <= 1;
    };
    const instLast = {}; // instId -> { hand, step, wasSingle }
    const handLast = { L: null, R: null }; // hand -> { instId, step }
    let lastSingle = null; // { hand, step, instId }
    const out = Array.from({ length: columns }, () => ({}));
    const getForcedHand = (instId, step) => {
      if (instId === "ride") return "R";
      const v = stickingOverrides?.[`${instId}:${step}`];
      return v === "L" || v === "R" ? v : null;
    };

    const scoreSingle = (hand, hit, step) => {
      let score = Math.abs(hit.pos - handPos[hand]) * 1.35; // jump minimization
      if (rightFavorIds.has(hit.id)) {
        score += hand === favoredHand ? -0.85 : 0.85; // favor hats/ride on favored hand
      }
      const prev = instLast[historyKeyFor(hit.id)];
      if (prev && prev.wasSingle) {
        const prevTime = stepStartQuarterTimes[prev.step] ?? prev.step;
        const currTime = stepStartQuarterTimes[step] ?? step;
        const spacingQuarter = currTime - prevTime;
        const allowAlternation =
          alternationIds.has(hit.id) &&
          canAlternateAtSpacing(spacingQuarter);
        // alternate repeated single-surface stream
        if (allowAlternation) score += prev.hand === hand ? 1.4 : -0.45;
        // On downbeats, lean toward the configured lead hand.
        if (quarterDownbeatStepSet.has(step)) {
          score += hand === lead ? -0.7 : 0.7;
        }
      } else if (!prev) {
        // Start new single-surface streams on the configured lead hand.
        score += hand === lead ? -0.6 : 0.6;
      }
      return score;
    };

    for (let step = 0; step < columns; step++) {
      const hits = handIds
        .filter((id) => (computedGrid[id]?.[step] ?? CELL.OFF) !== CELL.OFF)
        .map((id) => ({ id, pos: getHandPositionForInstrument(id, stickingHandedness) }))
        .sort((a, b) => a.pos - b.pos);
      if (!hits.length) continue;

      if (hits.length === 1) {
        const hit = hits[0];
        const historyKey = historyKeyFor(hit.id);
        const forced = getForcedHand(hit.id, step);
        const prev = instLast[historyKey];
        const prevInst = instLast[hit.id];
        const prevTime = prev ? (stepStartQuarterTimes[prev.step] ?? prev.step) : null;
        const currTime = stepStartQuarterTimes[step] ?? step;
        const spacingQuarter = prev ? (currTime - prevTime) : null;
        const allowAlternation =
          !!prev &&
          prev.wasSingle &&
          alternationIds.has(hit.id) &&
          canAlternateAtSpacing(spacingQuarter);
        const lastSingleTime = lastSingle ? (stepStartQuarterTimes[lastSingle.step] ?? lastSingle.step) : null;
        const lastSingleSpacingQuarter =
          lastSingle ? ((stepStartQuarterTimes[step] ?? step) - lastSingleTime) : null;
        const shouldAlternateFromLastSingleAcrossInstruments =
          !!lastSingle &&
          lastSingle.instId !== hit.id &&
          canAlternateAtSpacing(lastSingleSpacingQuarter);
        let hand;
        if (forced) {
          hand = forced;
        } else if (
          prevInst &&
          !prevInst.wasSingle &&
          prevInst.step === step - 1
        ) {
          // If a two-hand hit is followed immediately by a single on one of the same instruments,
          // keep that instrument on the same hand for continuity.
          hand = prevInst.hand;
        } else if (stickingKeepQuarterLeadHand && quarterDownbeatStepSet.has(step)) {
          // Global quarter rule: single hits on quarter downbeats use the configured lead hand.
          hand = lead;
        } else if (isCrashLike(hit.id)) {
          if (!prev || !prev.wasSingle) {
            // Crash pair starts by surface: crash1 -> L, crash2 -> R.
            hand = hit.id === "crash1" ? "L" : "R";
          } else if (prev.instId === hit.id) {
            // Repeating the same crash keeps the same hand (e.g. 2 1 1 2 -> R L L R).
            hand = prev.hand;
          } else {
            // Switching crash surface alternates hand.
            hand = prev.hand === "L" ? "R" : "L";
          }
        } else if (shouldAlternateFromLastSingleAcrossInstruments) {
          // Highest-priority ergonomic rule for single hits:
          // avoid same-hand jumps between different instruments when alternation is possible.
          hand = lastSingle.hand === "L" ? "R" : "L";
        } else if ((hit.id === "hihat" || hit.id === "hihatOpen") && (!prev || !prev.wasSingle)) {
          // Explicit hi-hat stream start (only when no better cross-instrument flow applies).
          hand = "R";
        } else if (allowAlternation) {
          // Hard alternation for selected instruments.
          hand = prev.hand === "L" ? "R" : "L";
        } else if (!prev && lastSingle) {
          // For new single-surface streams, keep short-range hand flow by alternating
          // from the previous single hit (even across instruments).
          const prevTime = stepStartQuarterTimes[lastSingle.step] ?? lastSingle.step;
          const currTime = stepStartQuarterTimes[step] ?? step;
          const spacingQuarter = currTime - prevTime;
          if (canAlternateAtSpacing(spacingQuarter)) {
            hand = lastSingle.hand === "L" ? "R" : "L";
          } else {
            const sL = scoreSingle("L", hit, step);
            const sR = scoreSingle("R", hit, step);
            hand = Math.abs(sL - sR) <= 0.02 ? lead : sL < sR ? "L" : "R";
          }
        } else {
          const sL = scoreSingle("L", hit, step);
          const sR = scoreSingle("R", hit, step);
          hand = Math.abs(sL - sR) <= 0.02 ? lead : sL < sR ? "L" : "R";
        }
        out[step][hit.id] = hand;
        handPos[hand] = hit.pos;
        instLast[hit.id] = { hand, step, wasSingle: true };
        instLast[historyKey] = { hand, step, wasSingle: true, instId: hit.id };
        handLast[hand] = { instId: hit.id, step };
        lastSingle = { hand, step, instId: hit.id };
        continue;
      }

      // Try opposite-hand pairings first (avoid same hand on simultaneous hits).
      const low = hits[0];
      const high = hits[1];
      const manualForcedLow = getForcedHand(low.id, step);
      const manualForcedHigh = getForcedHand(high.id, step);
      const isCrashPair =
        (low.id === "crash1" && high.id === "crash2") ||
        (low.id === "crash2" && high.id === "crash1");
      const autoForcedLow = isCrashPair ? (low.id === "crash1" ? "L" : "R") : null;
      const autoForcedHigh = isCrashPair ? (high.id === "crash1" ? "L" : "R") : null;
      const forcedLow = manualForcedLow || autoForcedLow;
      const forcedHigh = manualForcedHigh || autoForcedHigh;
      const pairings = [
        { low: "L", high: "R" },
        { low: "R", high: "L" },
      ];
      let best = pairings[0];
      let bestScore = Infinity;
      for (const p of pairings) {
        if (forcedLow && p.low !== forcedLow) continue;
        if (forcedHigh && p.high !== forcedHigh) continue;
        if (low.id === "ride" && p.low !== "R") continue;
        if (high.id === "ride" && p.high !== "R") continue;
        let score = 0;
        score += Math.abs(low.pos - handPos[p.low]) * 1.35;
        score += Math.abs(high.pos - handPos[p.high]) * 1.35;
        if (rightFavorIds.has(low.id)) score += p.low === favoredHand ? -0.7 : 0.7;
        if (rightFavorIds.has(high.id)) score += p.high === favoredHand ? -0.7 : 0.7;
        // Prefer hand continuity on the same instrument over crossing to a different one.
        // This avoids awkward patterns like L moving from hihat to tom while the hihat switches hands.
        const applyHandContinuityPreference = (hand, instId, stepIdx) => {
          const prev = handLast[hand];
          if (!prev) return;
          const prevTime = stepStartQuarterTimes[prev.step] ?? prev.step;
          const currTime = stepStartQuarterTimes[stepIdx] ?? stepIdx;
          const spacingQuarter = currTime - prevTime;
          // Stronger at short spacing where ergonomic flow matters most.
          const weight = spacingQuarter <= 1 ? 1.2 : 0.7;
          score += prev.instId === instId ? -weight : weight;
        };
        applyHandContinuityPreference(p.low, low.id, step);
        applyHandContinuityPreference(p.high, high.id, step);
        if (score < bestScore) {
          bestScore = score;
          best = p;
        }
      }

      out[step][low.id] = best.low;
      out[step][high.id] = best.high;
      handPos[best.low] = low.pos;
      handPos[best.high] = high.pos;
      instLast[low.id] = { hand: best.low, step, wasSingle: false };
      instLast[high.id] = { hand: best.high, step, wasSingle: false };
      handLast[best.low] = { instId: low.id, step };
      handLast[best.high] = { instId: high.id, step };
      if (isCrashPair) instLast.__crash_pair__ = { hand: best.high, step, wasSingle: false, instId: high.id };
      lastSingle = null;

      // For >2 simultaneous hits, place extras by nearest hand (unavoidable overlap case).
      for (let i = 2; i < hits.length; i++) {
        const hit = hits[i];
        const historyKey = historyKeyFor(hit.id);
        const forced = getForcedHand(hit.id, step);
        const hand =
          forced || (Math.abs(hit.pos - handPos.L) <= Math.abs(hit.pos - handPos.R) ? "L" : "R");
        out[step][hit.id] = hand;
        handPos[hand] = hit.pos;
        instLast[hit.id] = { hand, step, wasSingle: false };
        instLast[historyKey] = { hand, step, wasSingle: false, instId: hit.id };
        handLast[hand] = { instId: hit.id, step };
      }
      lastSingle = null;
    }
    return out;
  }, [computedGrid, instruments, columns, stickingLeadHand, stickingHandedness, quarterDownbeatStepSet, stickingOverrides, stepStartQuarterTimes, stickingKeepQuarterLeadHand]);
  const stickingAssignmentsByStep = React.useMemo(() => {
    const out = autoStickingAssignmentsByStep.map((step) => ({ ...step }));
    Object.entries(stickingOverrides || {}).forEach(([key, hand]) => {
      const [instId, idxRaw] = key.split(":");
      const idx = Number(idxRaw);
      if (!Number.isInteger(idx) || idx < 0 || idx >= out.length) return;
      if (hand !== "L" && hand !== "R") return;
      if ((computedGrid[instId]?.[idx] ?? CELL.OFF) === CELL.OFF) return;
      out[idx][instId] = hand;
    });
    return out;
  }, [autoStickingAssignmentsByStep, stickingOverrides, computedGrid]);
  const playabilityWarningSteps = React.useMemo(() => {
    const handIds = instruments.map((inst) => inst.id).filter((id) => !FOOT_INSTRUMENTS.has(id));
    const warned = [];
    for (let step = 0; step < columns; step++) {
      let handHits = 0;
      for (const id of handIds) {
        const v = computedGrid[id]?.[step] ?? CELL.OFF;
        if (v !== CELL.OFF) handHits += 1;
        if (handHits > 2) break;
      }
      if (handHits > 2) warned.push(step);
    }
    return warned;
  }, [computedGrid, instruments, columns]);
  const playabilityWarningStepSet = React.useMemo(
    () => new Set(playabilityWarningSteps),
    [playabilityWarningSteps]
  );

  const stepQuarterDurations = React.useMemo(() => {
    const out = [];
    quarterSubdivisionsByBar.forEach((row) => {
      row.forEach((subdiv) => {
        const s = Math.max(1, Number(subdiv) || 1);
        for (let i = 0; i < s; i++) out.push(1 / s);
      });
    });
    return out;
  }, [quarterSubdivisionsByBar]);


  const playback = usePlayback({
    instruments,
    grid: computedGrid,
    columns,
    bpm,
    resolution,
    stepQuarterDurations,
  });
  useEffect(() => {
    playbackPlayRef.current = playback.play;
  }, [playback.play]);
  useEffect(() => {
    let cancelled = false;
    const detectBrave = async () => {
      try {
        const maybeBrave = navigator?.brave;
        if (!maybeBrave || typeof maybeBrave.isBrave !== "function") return;
        const result = await maybeBrave.isBrave();
        if (!cancelled) setIsBraveBrowser(!!result);
      } catch (_) {}
    };
    detectBrave();
    return () => {
      cancelled = true;
    };
  }, []);

  // Unified transport toggle: matches Spacebar + Play button behavior exactly.
  const togglePlaybackFromBeginning = React.useCallback(() => {
    if (playback.isPlaying) {
      playback.stop();
} else {
      playback.setPlayhead(0);
      playback.play({ startStep: 0 });
    }
  }, [playback.isPlaying, playback.play, playback.stop, playback.setPlayhead]);
  const activeArrangementPlaybackEntry = React.useMemo(() => {
    if (!arrangementPlaybackEnabled) return null;
    return arrangementPlayableEntries[arrangementPlaybackIndex] || null;
  }, [arrangementPlaybackEnabled, arrangementPlayableEntries, arrangementPlaybackIndex]);
  const activeArrangementBarWithinBeat = React.useMemo(() => {
    const payload = activeArrangementPlaybackEntry?.row?.beat?.payload;
    if (!payload) return 0;
    return getBarIndexForStepFromPayload(payload, playback.playhead);
  }, [activeArrangementPlaybackEntry, playback.playhead]);
  const activeArrangementGlobalBarIndex = React.useMemo(() => {
    const entry = activeArrangementPlaybackEntry;
    if (!entry) return -1;
    let barOffset = 0;
    for (let i = 0; i < arrangementRows.length; i++) {
      if (i >= entry.rowIndex) break;
      barOffset += Math.max(1, Number(arrangementRows[i]?.sectionBars) || 1);
    }
    const beatBars = Math.max(1, Number(entry?.row?.beatBars) || 1);
    const repeatOffset = Math.max(0, Number(entry?.repeatIndex) || 0) * beatBars;
    const barInBeat = Math.max(0, Number(activeArrangementBarWithinBeat) || 0);
    return barOffset + repeatOffset + barInBeat;
  }, [activeArrangementPlaybackEntry, arrangementRows, activeArrangementBarWithinBeat]);
  const getArrangementRowDurationMs = React.useCallback(
    (row) => {
      const payload = row?.beat?.payload;
      if (!payload || typeof payload !== "object") return 0;
      const rawRes = Number(payload.resolution);
      const beatResolution = [4, 8, 16, 32].includes(rawRes) ? rawRes : 8;
      const rawTs = payload.timeSig || {};
      const beatTimeSig = {
        n: Math.max(1, Number(rawTs.n) || 4),
        d: Math.max(1, Number(rawTs.d) || 4),
      };
      const beatBars = Math.max(1, Math.min(64, Number(payload.bars) || 1));
      const quarterCount = getQuarterBeatsPerBar(beatTimeSig);
      const baseSubdiv = getBaseSubdivPerQuarter(beatResolution);
      const tupletsByBar = Array.from({ length: beatBars }, (_, barIdx) =>
        Array.from({ length: quarterCount }, (_, qIdx) => {
          const raw = payload.tupletsByBar?.[barIdx]?.[qIdx];
          return clampTupletValue(raw) ?? null;
        })
      );
      const quarterSubsByBar = tupletsByBar.map((r) =>
        resolveQuarterSubdivisions(r, baseSubdiv)
      );
      let totalQuarterUnits = 0;
      quarterSubsByBar.forEach((r) => {
        r.forEach(() => {
          totalQuarterUnits += 1;
        });
      });
      const beatBpm = Math.max(20, Math.min(400, Number(row.beatBpm || payload.bpm || bpm) || bpm));
      return Math.max(50, Math.round((totalQuarterUnits * 60 * 1000) / beatBpm));
    },
    [bpm]
  );
  const computeArrangementLoopRange = React.useCallback((queue, selection) => {
    if (!selection || !Array.isArray(queue) || queue.length < 1) return null;
    const selStart = selection.start;
    const selEnd = selection.end;
    const firstInRange = queue.findIndex(
      (entry) => entry.rowIndex >= selStart && entry.rowIndex <= selEnd
    );
    let lastInRange = -1;
    for (let i = queue.length - 1; i >= 0; i--) {
      const rowIndex = queue[i]?.rowIndex;
      if (rowIndex >= selStart && rowIndex <= selEnd) {
        lastInRange = i;
        break;
      }
    }
    if (firstInRange >= 0 && lastInRange >= firstInRange) {
      return { start: firstInRange, end: lastInRange };
    }
    return null;
  }, []);
  const arrangementPlaybackLoopRange = React.useMemo(
    () => computeArrangementLoopRange(arrangementPlayableEntries, normalizedArrangementSelection),
    [arrangementPlayableEntries, normalizedArrangementSelection, computeArrangementLoopRange]
  );
  useEffect(() => {
    arrangementPlayableEntriesRef.current = arrangementPlayableEntries;
  }, [arrangementPlayableEntries]);
  useEffect(() => {
    arrangementLoopRangeRef.current = arrangementPlaybackLoopRange;
  }, [arrangementPlaybackLoopRange]);
  useEffect(() => {
    arrangementPlaybackIndexRef.current = arrangementPlaybackIndex;
  }, [arrangementPlaybackIndex]);
  useEffect(() => {
    arrangementAdaptiveCompMsRef.current = arrangementBoundaryCompMs;
    setArrangementAdaptiveCurrentCompMs(arrangementBoundaryCompMs);
  }, [arrangementBoundaryCompMs, arrangementAdaptiveCompEnabled]);
  const startArrangementPlayback = React.useCallback((startRowIndex = null) => {
    if (!arrangementPlayableEntries.length) return;
    if (playback.isPlaying) playback.stop();
    if (arrangementSchedulerRef.current) {
      window.clearInterval(arrangementSchedulerRef.current);
      arrangementSchedulerRef.current = null;
    }
    arrangementStartedRef.current = false;
    arrangementNextSwitchAtRef.current = 0;
    arrangementAdaptiveCompMsRef.current = arrangementBoundaryCompMs;
    setArrangementAdaptiveCurrentCompMs(arrangementBoundaryCompMs);
    const queue = arrangementPlayableEntries;
    const loopRange = computeArrangementLoopRange(queue, normalizedArrangementSelection);
    let startIndex = loopRange ? loopRange.start : 0;
    if (Number.isFinite(startRowIndex)) {
      const wantedRow = Math.max(0, Math.floor(Number(startRowIndex)));
      const inRangeMatch = queue.findIndex((entry, i) => {
        if (entry?.rowIndex !== wantedRow) return false;
        if (!loopRange) return true;
        return i >= loopRange.start && i <= loopRange.end;
      });
      if (inRangeMatch >= 0) {
        startIndex = inRangeMatch;
      } else {
        const anyMatch = queue.findIndex((entry) => entry?.rowIndex === wantedRow);
        if (anyMatch >= 0) startIndex = anyMatch;
      }
    }
    setArrangementPlaybackIndex(startIndex);
    setArrangementPlaybackEnabled(true);
    const first = queue[startIndex];
    if (first?.row?.beat?.payload) {
      applyImportedBeatPayloadRef.current?.(
        first.row.beat.payload,
        `arrangement-play:${startIndex}:${first.row.id}:${first.row.beatId}`
      );
    }
  }, [
    arrangementPlayableEntries,
    normalizedArrangementSelection,
    arrangementBoundaryCompMs,
    playback.isPlaying,
    playback.stop,
    computeArrangementLoopRange,
  ]);
  const stopArrangementPlayback = React.useCallback(() => {
    playback.stop();
    if (arrangementSchedulerRef.current) {
      window.clearInterval(arrangementSchedulerRef.current);
      arrangementSchedulerRef.current = null;
    }
    arrangementStartedRef.current = false;
    arrangementNextSwitchAtRef.current = 0;
    arrangementAdaptiveCompMsRef.current = arrangementBoundaryCompMs;
    setArrangementAdaptiveCurrentCompMs(arrangementBoundaryCompMs);
    setArrangementPlaybackEnabled(false);
    setArrangementPlaybackIndex(0);
  }, [playback.stop]);
  useEffect(() => {
    if (!arrangementPlaybackEnabled) return;
    if (!arrangementPlayableEntries.length) {
      stopArrangementPlayback();
      return;
    }
    if (arrangementPlaybackIndex >= arrangementPlayableEntries.length) {
      setArrangementPlaybackIndex(arrangementPlayableEntries.length - 1);
    }
  }, [
    arrangementPlaybackEnabled,
    arrangementPlayableEntries,
    arrangementPlaybackIndex,
    stopArrangementPlayback,
  ]);
  useEffect(() => {
    if (!arrangementPlaybackEnabled) return;
    const entry = arrangementPlayableEntries[arrangementPlaybackIndex];
    if (!entry?.row?.beat?.payload) {
      stopArrangementPlayback();
      return;
    }
    if (pendingSharedLoadRef.current) return;
    const raf = window.requestAnimationFrame(() => {
      if (!arrangementStartedRef.current) {
        playback.setPlayhead(0);
        const playFn = playbackPlayRef.current;
        if (typeof playFn !== "function") {
          stopArrangementPlayback();
          return;
        }
        playFn({ startStep: 0 })
          .then(() => {
            arrangementStartedRef.current = true;
            arrangementNextSwitchAtRef.current = 0;
          })
          .catch(() => {
            stopArrangementPlayback();
          });
      }
    });
    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [
    arrangementPlaybackEnabled,
    arrangementPlayableEntries,
    arrangementPlaybackIndex,
    baseGrid,
    bars,
    resolution,
    timeSig.n,
    timeSig.d,
    playback.setPlayhead,
    stopArrangementPlayback,
    getArrangementRowDurationMs,
  ]);
  useEffect(() => {
    if (!arrangementPlaybackEnabled) return;
    if (arrangementSchedulerRef.current) {
      window.clearInterval(arrangementSchedulerRef.current);
      arrangementSchedulerRef.current = null;
    }
    const tick = () => {
      if (!arrangementStartedRef.current) return;
      const liveEntries = arrangementPlayableEntriesRef.current || [];
      if (!liveEntries.length) {
        stopArrangementPlayback();
        return;
      }
      const audioTime = playback.getAudioTime?.() || 0;
      const scheduleAheadSec = playback.getScheduleAheadTimeSec?.() || 0.12;
      if (!Number.isFinite(audioTime) || audioTime <= 0) return;
      let currentIndex = Math.max(
        0,
        Math.min(arrangementPlaybackIndexRef.current, liveEntries.length - 1)
      );
      let currentEntry = liveEntries[currentIndex];
      if (!currentEntry?.row?.beat?.payload) return;

      if (!(arrangementNextSwitchAtRef.current > 0)) {
        const currentDurSec = Math.max(0.04, getArrangementRowDurationMs(currentEntry.row) / 1000);
        const boundaryCompSec = arrangementAdaptiveCompMsRef.current / 1000;
        arrangementNextSwitchAtRef.current = audioTime + currentDurSec + boundaryCompSec;
        return;
      }

      let safety = 0;
      while (
        arrangementNextSwitchAtRef.current > 0 &&
        audioTime + scheduleAheadSec >= arrangementNextSwitchAtRef.current &&
        safety < 4
      ) {
        if (arrangementAdaptiveCompEnabled) {
          const latenessMs = Math.max(
            0,
            (audioTime + scheduleAheadSec - arrangementNextSwitchAtRef.current) * 1000
          );
          // Adapt compensation toward the observed scheduler latency, with light pull to user base value.
          const corrected = arrangementAdaptiveCompMsRef.current - latenessMs * 0.35;
          const pulled = corrected + (arrangementBoundaryCompMs - corrected) * 0.06;
          arrangementAdaptiveCompMsRef.current = Math.max(-40, Math.min(40, pulled));
        } else {
          arrangementAdaptiveCompMsRef.current = arrangementBoundaryCompMs;
        }
        setArrangementAdaptiveCurrentCompMs((prev) => {
          const next = Math.round(arrangementAdaptiveCompMsRef.current);
          return prev === next ? prev : next;
        });
        let nextIndex = currentIndex + 1;
        const liveLoopRange = arrangementLoopRangeRef.current;
        if (liveLoopRange && nextIndex > liveLoopRange.end) nextIndex = liveLoopRange.start;
        if (nextIndex >= liveEntries.length) {
          stopArrangementPlayback();
          return;
        }
        const nextEntry = liveEntries[nextIndex];
        if (!nextEntry?.row?.beat?.payload) {
          stopArrangementPlayback();
          return;
        }
        setArrangementPlaybackIndex(nextIndex);
        applyImportedBeatPayloadRef.current?.(
          nextEntry.row.beat.payload,
          `arrangement-play:${nextIndex}:${nextEntry.row.id}:${nextEntry.row.beatId}`
        );
        const nextDurSec = Math.max(0.04, getArrangementRowDurationMs(nextEntry.row) / 1000);
        const boundaryCompSec = arrangementAdaptiveCompMsRef.current / 1000;
        arrangementNextSwitchAtRef.current += nextDurSec + boundaryCompSec;
        currentIndex = nextIndex;
        currentEntry = nextEntry;
        safety += 1;
      }
    };
    arrangementSchedulerRef.current = window.setInterval(tick, 20);
    return () => {
      if (arrangementSchedulerRef.current) {
        window.clearInterval(arrangementSchedulerRef.current);
        arrangementSchedulerRef.current = null;
      }
    };
  }, [
    arrangementPlaybackEnabled,
    arrangementAdaptiveCompEnabled,
    arrangementBoundaryCompMs,
    getArrangementRowDurationMs,
    stopArrangementPlayback,
    playback.getAudioTime,
    playback.getScheduleAheadTimeSec,
  ]);
  useEffect(() => {
    if (!arrangementPlaybackEnabled) return;
    if (playback.isPlaying) return;
    if (!arrangementStartedRef.current) return;
    stopArrangementPlayback();
  }, [arrangementPlaybackEnabled, playback.isPlaying, stopArrangementPlayback]);
  useEffect(() => {
    if (isArrangementOpen) return;
    if (!arrangementPlaybackEnabled) return;
    playback.stop();
    setArrangementPlaybackEnabled(false);
    arrangementStartedRef.current = false;
    arrangementNextSwitchAtRef.current = 0;
    if (arrangementSchedulerRef.current) {
      window.clearInterval(arrangementSchedulerRef.current);
      arrangementSchedulerRef.current = null;
    }
  }, [isArrangementOpen, arrangementPlaybackEnabled, playback.stop]);

  
  const notationExportRef = useRef(null);

  const setNotationExportEl = React.useCallback((el) => {
    if (el) notationExportRef.current = el;
  }, []);

  const handlePrintSubmit = React.useCallback(async () => {
    try {
      await exportNotationPdf(notationExportRef.current, {
        title: printTitle.trim() || "Drum Notation",
        scoreTitle: printTitle.trim(),
        composer: printComposer.trim(),
        watermark: printWatermarkEnabled,
      });
      setIsPrintDialogOpen(false);
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to export PDF");
    }
  }, [printTitle, printComposer, printWatermarkEnabled]);
  const bakeLoopPreview = React.useCallback(() => {
    if (!loopRule) return;
    setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
    setLoopRule(null);
    setSelection(null);
  }, [loopRule, loopRepeats, loopOverlapMode]);
  const buildCurrentBeatPayload = React.useCallback(() => {
    const grid = {};
    ALL_INSTRUMENTS.forEach((inst) => {
      const row = baseGrid[inst.id] || [];
      const events = [];
      for (let idx = 0; idx < Math.min(columns, row.length); idx++) {
        const cell = row[idx];
        if (cell === CELL.ACCENT) events.push([idx, 3]);
        else if (cell === CELL.ON) events.push([idx, 1]);
        else if (cell === CELL.GHOST) events.push([idx, 2]);
      }
      if (events.length) grid[inst.id] = events;
    });
    return {
      v: 1,
      kitInstrumentIds,
      bars,
      resolution,
      timeSig,
      bpm,
      layout,
      tupletsByBar: normalizedTupletOverridesByBar,
      grid,
    };
  }, [
    baseGrid,
    columns,
    kitInstrumentIds,
    bars,
    resolution,
    timeSig,
    bpm,
    layout,
    normalizedTupletOverridesByBar,
  ]);
  const loadedLocalBeat = React.useMemo(
    () => localBeats.find((b) => String(b?.id || "") === String(loadedLocalBeatId || "")) || null,
    [localBeats, loadedLocalBeatId]
  );
  const normalizedCurrentPayloadJson = React.useMemo(
    () => JSON.stringify(buildCurrentBeatPayload()),
    [buildCurrentBeatPayload]
  );
  const loadedLocalPayloadJson = React.useMemo(
    () => JSON.stringify(loadedLocalBeat?.payload || {}),
    [loadedLocalBeat]
  );
  const normalizedDraftName = React.useMemo(() => beatNameDraft.trim(), [beatNameDraft]);
  const normalizedDraftCategory = React.useMemo(
    () => (beatCategoryDraft === "all" ? "Groove" : beatCategoryDraft),
    [beatCategoryDraft]
  );
  const normalizedDraftStyle = React.useMemo(
    () => (beatStyleDraft === "all" ? undefined : beatStyleDraft.trim() || undefined),
    [beatStyleDraft]
  );
  const isLoadedLocalBeatDirty = React.useMemo(() => {
    if (!loadedLocalBeat) return false;
    const savedName = String(loadedLocalBeat.name || "").trim();
    const savedCategory = String(loadedLocalBeat.category || "Groove");
    const savedStyle = loadedLocalBeat.style ? String(loadedLocalBeat.style).trim() : undefined;
    const nameChanged = normalizedDraftName !== savedName;
    const categoryChanged = normalizedDraftCategory !== savedCategory;
    const styleChanged = (normalizedDraftStyle || undefined) !== (savedStyle || undefined);
    const payloadChanged = normalizedCurrentPayloadJson !== loadedLocalPayloadJson;
    return nameChanged || categoryChanged || styleChanged || payloadChanged;
  }, [
    loadedLocalBeat,
    normalizedDraftName,
    normalizedDraftCategory,
    normalizedDraftStyle,
    normalizedCurrentPayloadJson,
    loadedLocalPayloadJson,
  ]);
  const isLoadedLocalBeatNameChanged = React.useMemo(() => {
    if (!loadedLocalBeat) return false;
    const savedName = String(loadedLocalBeat.name || "").trim();
    return normalizedDraftName !== savedName;
  }, [loadedLocalBeat, normalizedDraftName]);
  const canUpdateLoadedLocalBeat =
    arrangementSourceTab === "local" &&
    Boolean(loadedLocalBeat) &&
    isLoadedLocalBeatDirty &&
    !isLoadedLocalBeatNameChanged;

  const applyImportedBeatPayload = React.useCallback(
    (payload, sourceKey) => {
      const shareSourceKey = sourceKey || `import:${Date.now()}`;
      if (!payload || typeof payload !== "object") return;
      if (appliedSharedKeyRef.current === shareSourceKey) return;
      const nextBars = Math.max(1, Math.min(8, Number(payload.bars) || 1));
      const resOrder = [4, 8, 16, 32];
      const rawRes = Number(payload.resolution);
      const nextResolution = resOrder.includes(rawRes) ? rawRes : 8;
      const rawTs = payload.timeSig || {};
      const nextTimeSig = {
        n: Math.max(1, Number(rawTs.n) || 4),
        d: Math.max(1, Number(rawTs.d) || 4),
      };
      const quarterCount = getQuarterBeatsPerBar(nextTimeSig);
      const tupletsByBar = Array.from({ length: nextBars }, (_, barIdx) =>
        Array.from({ length: quarterCount }, (_, qIdx) => {
          const raw = payload.tupletsByBar?.[barIdx]?.[qIdx];
          return clampTupletValue(raw) ?? null;
        })
      );
      const nextKitIds = Array.isArray(payload.kitInstrumentIds)
        ? [...new Set(payload.kitInstrumentIds.filter((id) => INSTRUMENT_BY_ID[id]))]
        : [];
      if (!nextKitIds.length) nextKitIds.push(...DRUMKIT_PRESETS.standard);

      pendingSharedLoadRef.current = {
        bars: nextBars,
        resolution: nextResolution,
        timeSig: nextTimeSig,
        tupletsByBar,
        grid: payload.grid && typeof payload.grid === "object" ? payload.grid : {},
      };
      appliedSharedKeyRef.current = shareSourceKey;

      const nextLayout = payload.layout;
      const layoutOptions = ["grid-top", "notation-top", "grid-right", "notation-right"];
      if (layoutOptions.includes(nextLayout)) setLayout(nextLayout);
      const nextBpm = Number(payload.bpm);
      if (Number.isFinite(nextBpm)) setBpm(Math.max(20, Math.min(400, Math.round(nextBpm))));

      setModifiedPresetBase(null);
      setPendingPresetChange(null);
      setPendingRemoval(null);
      setSelection(null);
      setLoopRule(null);
      setActiveTab("none");
      setLoopRepeats("off");
      setLoadedLocalBeatId(null);
      setKitInstrumentIds(nextKitIds);
      setBars(nextBars);
      setResolution(nextResolution);
      setTimeSig(nextTimeSig);
      setTupletOverridesByBar(tupletsByBar);
    },
    []
  );
  useEffect(() => {
    applyImportedBeatPayloadRef.current = applyImportedBeatPayload;
  }, [applyImportedBeatPayload]);
  useEffect(() => {
    const shareSourceKey = routeOptions.shareId
      ? `g:${routeOptions.shareId}`
      : routeOptions.shared
        ? `s:${routeOptions.shared}`
        : "";
    const effectiveSharedState = routeOptions.shareId ? resolvedSharedState : requestedSharedState;
    if (!effectiveSharedState || typeof effectiveSharedState !== "object") return;
    applyImportedBeatPayload(effectiveSharedState, shareSourceKey);
  }, [requestedSharedState, resolvedSharedState, routeOptions.shared, routeOptions.shareId, applyImportedBeatPayload]);
  const saveCurrentBeatLocal = React.useCallback(() => {
    const fallbackName = `Beat ${localBeats.length + 1}`;
    const name = beatNameDraft.trim() || fallbackName;
    const now = new Date().toISOString();
    const item = {
      id: `local-${Math.random().toString(36).slice(2, 10)}`,
      name,
      category: beatCategoryDraft === "all" ? "Groove" : beatCategoryDraft,
      style: beatStyleDraft === "all" ? undefined : beatStyleDraft.trim() || undefined,
      timeSigCategory: `${timeSig.n}/${timeSig.d}`,
      bpm,
      createdAt: now,
      payload: buildCurrentBeatPayload(),
      source: "local",
    };
    setLocalBeatsWithUndo((prev) => [item, ...prev].slice(0, 500));
    setLoadedLocalBeatId(item.id);
  }, [
    beatNameDraft,
    beatCategoryDraft,
    beatStyleDraft,
    timeSig,
    bpm,
    buildCurrentBeatPayload,
    localBeats.length,
    setLocalBeatsWithUndo,
  ]);
  const updateCurrentLoadedBeatLocal = React.useCallback(() => {
    if (!loadedLocalBeatId) return;
    const name = beatNameDraft.trim() || String(loadedLocalBeat?.name || "Untitled Beat");
    const payload = buildCurrentBeatPayload();
    const category = beatCategoryDraft === "all" ? "Groove" : beatCategoryDraft;
    const style = beatStyleDraft === "all" ? undefined : beatStyleDraft.trim() || undefined;
    setLocalBeatsWithUndo((prev) =>
      prev.map((beat) =>
        String(beat?.id || "") === String(loadedLocalBeatId)
          ? {
              ...beat,
              name,
              category,
              style,
              timeSigCategory: `${timeSig.n}/${timeSig.d}`,
              bpm,
              payload,
            }
          : beat
      )
    );
  }, [
    loadedLocalBeatId,
    loadedLocalBeat,
    beatNameDraft,
    buildCurrentBeatPayload,
    beatCategoryDraft,
    beatStyleDraft,
    setLocalBeatsWithUndo,
    timeSig.n,
    timeSig.d,
    bpm,
  ]);

  const submitCurrentBeatPublic = React.useCallback(async (opts = null) => {
    const titleInput = String(opts?.title ?? beatNameDraft).trim();
    const composerInput = String(opts?.composer ?? printComposer).trim();
    const categoryInput = String(opts?.category ?? beatCategoryDraft).trim() || "all";
    const styleInput = String(opts?.style ?? beatStyleDraft).trim() || "all";
    const name = titleInput;
    if (!name) return false;
    setPublicLibraryError("");
    try {
      const res = await fetch("/api/beats", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          title: name,
          composer: composerInput || undefined,
          category: categoryInput === "all" ? "Groove" : categoryInput,
          style: styleInput === "all" ? undefined : styleInput || undefined,
          timeSigCategory: `${timeSig.n}/${timeSig.d}`,
          bpm,
          payload: buildCurrentBeatPayload(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublicLibraryError(data?.error || "Failed to submit beat");
        return false;
      }
      setPublicBeats((prev) => [data?.beat, ...prev].filter(Boolean));
      return true;
    } catch (_) {
      setPublicLibraryError("Failed to submit beat");
      return false;
    }
  }, [beatNameDraft, printComposer, beatCategoryDraft, beatStyleDraft, timeSig, bpm, buildCurrentBeatPayload]);
  const openPublicSubmitDialog = React.useCallback(() => {
    const nextTitle = (printTitle || beatNameDraft || "").trim();
    const nextComposer = (lockedPublicComposer || printComposer || "").trim();
    setPublicLibraryError("");
    setPublicSubmitTitle(nextTitle);
    setPublicSubmitComposer(nextComposer);
    setPublicSubmitCategory(beatCategoryDraft);
    setPublicSubmitStyle(beatStyleDraft);
    setIsPublicSubmitDialogOpen(true);
  }, [printTitle, beatNameDraft, printComposer, lockedPublicComposer, beatCategoryDraft, beatStyleDraft]);
  const confirmPublicSubmit = React.useCallback(async () => {
    const title = publicSubmitTitle.trim();
    if (!title) return;
    const composer = (lockedPublicComposer || publicSubmitComposer).trim();
    if (!composer) {
      setPublicLibraryError("Composer is required for public submission.");
      return;
    }
    if (publicSubmitCategory === "all" || publicSubmitStyle === "all") {
      setPublicLibraryError("Category and style are required for public submission.");
      return;
    }
    const ok = await submitCurrentBeatPublic({
      title,
      composer,
      category: publicSubmitCategory,
      style: publicSubmitStyle,
    });
    if (!ok) return;
    if (!lockedPublicComposer) setLockedPublicComposer(composer);
    // Keep title/composer in sync across print, midi, and public submit flows.
    setPrintTitle(title);
    setPrintComposer(composer);
    setBeatNameDraft(title);
    setIsPublicSubmitDialogOpen(false);
    setIsBeatLibraryOpen(false);
  }, [
    publicSubmitTitle,
    publicSubmitComposer,
    publicSubmitCategory,
    publicSubmitStyle,
    lockedPublicComposer,
    submitCurrentBeatPublic,
    setPrintTitle,
    setPrintComposer,
  ]);

  const refreshPublicLibrary = React.useCallback(async () => {
    setPublicLibraryLoading(true);
    setPublicLibraryError("");
    try {
      const params = new URLSearchParams();
      params.set("sort", librarySort === "oldest" ? "oldest" : "latest");
      if (beatCategoryDraft !== "all") params.set("category", beatCategoryDraft);
      if (libraryTimeSigFilter !== "all") params.set("timeSig", libraryTimeSigFilter);
      if (beatStyleDraft !== "all") params.set("style", beatStyleDraft);
      const res = await fetch(`/api/beats?${params.toString()}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPublicLibraryError(data?.error || "Failed to load public library");
        setPublicLibraryLoading(false);
        return;
      }
      setPublicBeats(Array.isArray(data?.beats) ? data.beats : []);
    } catch (_) {
      setPublicLibraryError("Failed to load public library");
    } finally {
      setPublicLibraryLoading(false);
    }
  }, [librarySort, beatCategoryDraft, libraryTimeSigFilter, beatStyleDraft]);
  useEffect(() => {
    const libraryVisibleInCombinedWindow = isArrangementOpen && arrangementSourceTab === "public";
    if (!libraryVisibleInCombinedWindow) return;
    refreshPublicLibrary();
  }, [isArrangementOpen, arrangementSourceTab, refreshPublicLibrary]);
  useEffect(() => {
    const libraryVisibleInCombinedWindow = isArrangementOpen && arrangementSourceTab === "public";
    if (libraryVisibleInCombinedWindow) return;
    setPublicLibraryError("");
  }, [isArrangementOpen, arrangementSourceTab]);

  const handleShareLink = React.useCallback(async () => {
    const payload = buildCurrentBeatPayload();
    let text = "";
    let usedShortLink = false;
    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ payload }),
      });
      if (res.ok) {
        const data = await res.json();
        const id = String(data?.id || "");
        if (id) {
          text = `${window.location.origin}/g/${encodeURIComponent(id)}`;
          usedShortLink = true;
        }
      }
    } catch (_) {
      // fall through to local URL state fallback
    }
    if (!text) {
      const encoded = encodeShareState(payload);
      if (!encoded) {
        alert("Failed to create share link");
        return;
      }
      const url = new URL(window.location.origin + "/");
      url.searchParams.set("s", encoded);
      text = url.toString();
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setShareLinkType(usedShortLink ? "Short" : "Long");
        setShareCopied(true);
        if (shareCopiedTimerRef.current) window.clearTimeout(shareCopiedTimerRef.current);
        shareCopiedTimerRef.current = window.setTimeout(() => {
          setShareCopied(false);
          shareCopiedTimerRef.current = null;
        }, 1400);
      } else {
        window.prompt("Copy share link", text);
      }
    } catch (_) {
      window.prompt("Copy share link", text);
    }
  }, [
    buildCurrentBeatPayload,
  ]);
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

  useEffect(() => {
    if (!isEmbedMode) return;
    if (window.parent === window) return;

    const sendEmbedHeight = () => {
      const doc = document.documentElement;
      const body = document.body;
      const height = Math.max(
        doc?.scrollHeight || 0,
        doc?.offsetHeight || 0,
        body?.scrollHeight || 0,
        body?.offsetHeight || 0
      );
      window.parent.postMessage(
        {
          type: "drumgrid-embed-height",
          exampleId: requestedExample?.id || null,
          height: Math.max(200, Math.ceil(height)),
        },
        "*"
      );
    };

    const raf = window.requestAnimationFrame(sendEmbedHeight);
    const timeout = window.setTimeout(sendEmbedHeight, 120);
    window.addEventListener("resize", sendEmbedHeight);
    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", sendEmbedHeight);
    };
  }, [isEmbedMode, requestedExample, bars, columns, layout, resolution, timeSig, instruments.length]);



  // Resize grid when resolution/bars change (preserve existing hits)
  useEffect(() => {
    setBaseGrid((prev) => {
      const needsResize = ALL_INSTRUMENTS.some(
        (i) => (prev[i.id]?.length ?? 0) !== columns
      );
      if (!needsResize) return prev;
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
        setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    // Normal edit (or edit within loop source)
    setBaseGridWithUndo((prev) => {
      const next = { ...prev };
      const current = prev[inst][idx];
      // Articulated hits behave like "on" for regular click toggling.
      const normalized = current === CELL.GHOST || current === CELL.ACCENT ? CELL.ON : current;
      const nextVal = normalized === CELL.OFF ? CELL.ON : CELL.OFF;
      next[inst] = [...prev[inst]];
      next[inst][idx] = nextVal;
      return next;
    });
  };

  const cycleStickingOverride = React.useCallback((inst, idx) => {
    if (FOOT_INSTRUMENTS.has(inst)) return false;
    const val = computedGrid[inst]?.[idx] ?? CELL.OFF;
    if (val === CELL.OFF) return false;
    const clickedRow = instruments.findIndex((x) => x.id === inst);
    const currentHand = stickingAssignmentsByStep?.[idx]?.[inst] === "L" ? "L" : "R";
    const targetHand = currentHand === "L" ? "R" : "L";
    const oppositeHand = targetHand === "L" ? "R" : "L";
    const leadHand = stickingLeadHand === "left" ? "L" : "R";
    const nonLeadHand = leadHand === "L" ? "R" : "L";
    const clickedInSelection = Boolean(
      selection &&
      clickedRow >= selection.rowStart &&
      clickedRow <= selection.rowEnd &&
      idx >= selection.start &&
      idx < selection.endExclusive
    );
    if (clickedInSelection) {
      const selectionSignature = `${selection.rowStart}:${selection.rowEnd}:${selection.start}:${selection.endExclusive}`;
      const prevCycle = stickingSelectionCycleRef.current;
      const nextPhase =
        prevCycle.signature === selectionSignature
          ? (prevCycle.phase + 1) % 4
          : 0;
      stickingSelectionCycleRef.current = { signature: selectionSignature, phase: nextPhase };
      setStickingOverrides((prev) => {
        const next = { ...(prev || {}) };
        for (let r = selection.rowStart; r <= selection.rowEnd; r++) {
          const instId = instruments[r]?.id;
          if (!instId || FOOT_INSTRUMENTS.has(instId)) continue;
          for (let c = selection.start; c < selection.endExclusive; c++) {
            if ((computedGrid[instId]?.[c] ?? CELL.OFF) === CELL.OFF) continue;
            const k = `${instId}:${c}`;
            const autoHand = autoStickingAssignmentsByStep?.[c]?.[instId] === "L" ? "L" : "R";
            if (nextPhase === 3) {
              // Original: clear manual edits for selected active cells.
              delete next[k];
              continue;
            }
            let desired = targetHand;
            if (nextPhase === 0) desired = leadHand; // Force lead hand
            else if (nextPhase === 1) desired = nonLeadHand; // Force non-lead hand
            // nextPhase === 2: Toggle (existing behavior).
            if (desired === autoHand) delete next[k];
            else next[k] = desired;
          }
        }
        return next;
      });
      return true;
    }
    const activeHandIds = instruments
      .map((i) => i.id)
      .filter((id) => !FOOT_INSTRUMENTS.has(id) && (computedGrid[id]?.[idx] ?? CELL.OFF) !== CELL.OFF);
    setStickingOverrides((prev) => {
      const next = { ...(prev || {}) };
      for (const id of activeHandIds) {
        const k = `${id}:${idx}`;
        const autoHand = autoStickingAssignmentsByStep?.[idx]?.[id] === "L" ? "L" : "R";
        const desired = id === inst ? targetHand : oppositeHand;
        if (desired === autoHand) delete next[k];
        else next[k] = desired;
      }
      return next;
    });
    return true;
  }, [computedGrid, autoStickingAssignmentsByStep, stickingAssignmentsByStep, instruments, selection, stickingLeadHand]);

  const cycleArticulation = (inst, idx, forceValue = null) => {
    if (!GHOST_ENABLED.has(inst)) return;

    if (loopRule) {
      const r = instruments.findIndex((x) => x.id === inst);
      const inLoopRows = r >= loopRule.rowStart && r <= loopRule.rowEnd;
      const inSourceCols = idx >= loopRule.start && idx < loopRule.start + loopRule.length;
      const inSource = inLoopRows && inSourceCols;
      const inGenerated = inLoopRows && idx >= loopRule.start + loopRule.length;

      // Match click behavior: long-pressing outside the source bakes & exits without toggling.
      if (!inSource || inGenerated) {
        setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
        setLoopRule(null);
        setSelection(null);
        return;
      }
    }

    setBaseGridWithUndo((prev) => {
      const next = { ...prev };
      const current = prev[inst][idx];
      if (forceValue && (forceValue === CELL.ON || forceValue === CELL.GHOST || forceValue === CELL.ACCENT)) {
        next[inst] = [...prev[inst]];
        next[inst][idx] = forceValue;
        return next;
      }

      // Only toggle ghost on active cells.
      if (current === CELL.OFF) return prev;
      const nextVal =
        current === CELL.ON ? CELL.GHOST :
        current === CELL.GHOST ? CELL.ACCENT :
        CELL.ON;

      next[inst] = [...prev[inst]];
      next[inst][idx] = nextVal;
      return next;
    });
  };


  return (
    <div
      className={`${isEmbedMode ? "min-h-full bg-neutral-900 text-white p-3" : "min-h-screen bg-neutral-900 text-white p-6"}`}
      onMouseDown={(e) => {
        if (!legacySelectionEnabled && selection) {
          const el = e.target;
          if (el && el.closest && el.closest("[data-loopui='1']")) return;
          if (el && el.closest && el.closest("[data-gridsurface='1']")) {
            const cellEl = el?.closest?.("[data-gridcell='1']");
            if (cellEl) {
              const row = Number(cellEl.getAttribute("data-row"));
              const col = Number(cellEl.getAttribute("data-col"));
              const inSelection = Array.isArray(wrappedSelectionCells) && wrappedSelectionCells.length > 0
                ? wrappedSelectionCells.some((c) => c.row === row && c.col === col)
                : row >= selection.rowStart &&
                  row <= selection.rowEnd &&
                  col >= selection.start &&
                  col < selection.endExclusive;
              if (inSelection) return;
            }
            if (loopRule) {
              setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
              setLoopRule(null);
              setSelection(null);
            } else {
              setLoopRule(null);
              setSelection(null);
            }
            return;
          }
        }
        if (!loopRule) return;
        const el = e.target;
        if (el && el.closest && el.closest("[data-loopui='1']")) return;
        // Cell clicks are handled in-cell (source edit or bake depending on role).
        if (el && el.closest && el.closest("[data-gridcell='1']")) return;
        // Clicking anywhere on the grid surface (including bar gaps and spaces between cells)
        // should bake the loop, same as clicking a non-source cell.
        if (el && el.closest && el.closest("[data-gridsurface='1']")) {
          setBaseGridWithUndo((prev) => bakeLoopInto(prev, loopRule, loopRepeats, loopOverlapMode));
          setLoopRule(null);
          setSelection(null);
          return;
        }
        // Non-grid click: dismiss looping without baking.
        setLoopRule(null);
        setSelection(null);
      }}
    >
      
      {isEmbedMode && (
        <header className="mb-3 flex items-center justify-between gap-3" data-loopui='1'>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">
              {requestedExample?.title || "Drum Groove Example"}
            </div>
            <a
              href={requestedExample ? `/?example=${encodeURIComponent(requestedExample.id)}` : "/"}
              className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-2"
              target="_blank"
              rel="noreferrer"
            >
              Open in editor
            </a>
          </div>
          <div className="flex items-center gap-2">
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
              <div className="min-w-[52px] px-2 py-1 text-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700">
                {bpm}
              </div>
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
        </header>
      )}
      <header className={`${isEmbedMode ? "hidden" : "flex flex-col gap-3"}`} data-loopui='1'>
        {showBraveAudioNotice && isBraveBrowser && playback.slowStartDetected && (
          <div className="rounded-lg border border-amber-700/70 bg-amber-900/20 px-3 py-2 text-xs text-amber-100 flex items-start justify-between gap-3">
            <div>
              <div className="font-medium">Low Volume?</div>
              <div className="mt-0.5 text-amber-100/90">
                {`Detected delayed playback start (~${(Math.max(0, playback.startupLagMs || 0) / 1000).toFixed(1)}s). `}
                Click the Brave lion icon in the address bar, then set
                <span className="mx-1 font-medium">Fingerprinting</span>
                to
                <span className="ml-1 font-medium">Allow</span>.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowBraveAudioNotice(false)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Spacebar") e.preventDefault();
              }}
              className="px-2 py-0.5 rounded border border-amber-700/70 text-amber-100 hover:bg-amber-800/40"
            >
              Close tip
            </button>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-semibold mr-2">Drum Grid → Notation</h1>

          
          <div className="flex items-center gap-2 order-1" data-loopui='1'>
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
          </div>

          <div className="flex items-center gap-2 order-2">
            <button
              type="button"
              onClick={handleTopUndo}
              disabled={!canUndoTop}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 ${
                !canUndoTop ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title={isLibraryHistoryActive ? "Undo library change" : "Undo (grid only)"}
            >
              ←
            </button>
            <button
              type="button"
              onClick={handleTopRedo}
              disabled={!canRedoTop}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60 ${
                !canRedoTop ? "opacity-40 cursor-not-allowed" : ""
              }`}
              title={isLibraryHistoryActive ? "Redo library change" : "Redo (grid only)"}
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
            <button
              type="button"
              onClick={openBeatLibraryWindow}
              className="touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              title="Open beat library"
            >
              Library
            </button>
            <button
              type="button"
              onClick={() => setIsShareActionsDialogOpen(true)}
              className={`touch-none select-none px-3 py-1.5 rounded border text-sm ${
                shareCopied
                  ? "bg-neutral-800 border-neutral-600 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              }`}
              title="Share, print, and export options"
            >
              Share
            </button>
          </div>

        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActiveTab((t) => (t === "timing" ? "none" : "timing"))}
            className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
              activeTab === "timing"
                ? "bg-neutral-800 border-neutral-600 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
            }`}
          >
            Drum Grid
          </button>
          <button
            onClick={() => setActiveTab((t) => (t === "notation" ? "none" : "notation"))}
            className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
              activeTab === "notation"
                ? "bg-neutral-800 border-neutral-600 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
            }`}
          >
            notation
          </button>
          <button
            onClick={() => setActiveTab((t) => (t === "selection" ? "none" : "selection"))}
            className={`touch-none select-none px-3 py-1.5 rounded border text-sm capitalize ${
              activeTab === "selection"
                ? "bg-neutral-800 border-neutral-600 text-white"
                : "bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
            }`}
          >
            editing
          </button>
          {playabilityWarningsEnabled && playabilityWarningSteps.length > 0 && (
            <span className="text-[11px] text-red-500 whitespace-nowrap">
              {playabilityWarningSteps.length} playability warning{playabilityWarningSteps.length === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {activeTab === "timing" && (
          <div className="flex flex-col gap-3">
            <div ref={gridMenuRowPrimaryRef} className="flex flex-wrap items-center gap-4">
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
                    className="min-w-[88px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 cursor-pointer hover:bg-neutral-700/60"
                    title="Open drumkit editor"
                  >
                    {selectedPresetLabel}
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
                <div className="flex items-center gap-2">
                  <span className="text-sm text-neutral-300 whitespace-nowrap">Tuplets</span>
                  <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                    <button
                      type="button"
                      onClick={() => stepGlobalTupletValue(-1)}
                      className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                      aria-label="Previous global tuplet value"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={toggleGlobalTupletOffLast}
                      className="min-w-[64px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 hover:bg-neutral-700/50"
                      title="Toggle off / last tuplet"
                    >
                      {globalTupletValue === "mixed"
                        ? "Mixed"
                        : globalTupletValue == null
                          ? "Off"
                          : String(globalTupletValue)}
                    </button>
                    <button
                      type="button"
                      onClick={() => stepGlobalTupletValue(1)}
                      className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                      aria-label="Next global tuplet value"
                    >
                      +
                    </button>
                  </div>
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

            <div ref={gridMenuRowSecondaryRef} className="flex flex-wrap items-center gap-4" />
          </div>
        )}

        {activeTab === "selection" && (
          <div ref={selectionMenuRowRef} className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() =>
                setStickingEditModeEnabled((v) => {
                  const next = !v;
                  if (next) setStickingGuideEnabled(true);
                  return next;
                })
              }
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                stickingEditModeEnabled
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="When enabled, clicking active hand-hit cells edits R/L sticking instead of toggling notes"
            >
              Sticking edit mode
            </button>

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
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Loop overlap</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() =>
                    setLoopOverlapMode((prev) => {
                      const idx = Math.max(0, MOVE_OVERLAP_MODES.findIndex((m) => m.id === prev));
                      return MOVE_OVERLAP_MODES[(idx - 1 + MOVE_OVERLAP_MODES.length) % MOVE_OVERLAP_MODES.length].id;
                    })
                  }
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Previous loop overlap mode"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLoopOverlapMode((prev) => (prev === "all-to-all" ? "active-to-empty" : "all-to-all"))
                  }
                  className="min-w-[126px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 hover:bg-neutral-700/50"
                  title="Toggle all overwrites"
                  aria-label="Toggle loop overlap all overwrites"
                >
                  {MOVE_OVERLAP_MODES.find((m) => m.id === loopOverlapMode)?.label || "Fill in gaps"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setLoopOverlapMode((prev) => {
                      const idx = Math.max(0, MOVE_OVERLAP_MODES.findIndex((m) => m.id === prev));
                      return MOVE_OVERLAP_MODES[(idx + 1) % MOVE_OVERLAP_MODES.length].id;
                    })
                  }
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Next loop overlap mode"
                >
                  +
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-neutral-300">Move overlap</span>
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() =>
                    setMoveOverlapMode((prev) => {
                      const idx = Math.max(0, MOVE_OVERLAP_MODES.findIndex((m) => m.id === prev));
                      return MOVE_OVERLAP_MODES[(idx - 1 + MOVE_OVERLAP_MODES.length) % MOVE_OVERLAP_MODES.length].id;
                    })
                  }
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Previous move overlap mode"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMoveOverlapMode((prev) => (prev === "all-to-all" ? "active-to-empty" : "all-to-all"))
                  }
                  className="min-w-[126px] px-3 py-1 flex items-center justify-center text-sm text-white bg-neutral-800 border-l border-r border-neutral-700 hover:bg-neutral-700/50"
                  title="Toggle all overwrites"
                  aria-label="Toggle move overlap all overwrites"
                >
                  {MOVE_OVERLAP_MODES.find((m) => m.id === moveOverlapMode)?.label || "All overrides all"}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMoveOverlapMode((prev) => {
                      const idx = Math.max(0, MOVE_OVERLAP_MODES.findIndex((m) => m.id === prev));
                      return MOVE_OVERLAP_MODES[(idx + 1) % MOVE_OVERLAP_MODES.length].id;
                    })
                  }
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Next move overlap mode"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === "notation" && (
          <div ref={notationMenuRowRef} className="flex flex-wrap items-center gap-4">
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
            <button
              type="button"
              onClick={() => setShowNotationSticking((v) => !v)}
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                showNotationSticking
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Show inferred sticking (R/L) beneath notes in notation"
            >
              Show sticking
            </button>
            <button
              type="button"
              onClick={() =>
                setNotationStickingView((v) => (v === "stacked" ? "split-rows" : "stacked"))
              }
              className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                showNotationSticking
                  ? "bg-neutral-800 border-neutral-700 text-white"
                  : "bg-neutral-900 border-neutral-800 text-neutral-600"
              }`}
              title="Change sticking display"
            >
              {notationStickingView === "stacked" ? "Stacked" : "Split rows"}
            </button>
          </div>
        )}
      </header>


      
      
      <main
        className={`touch-none select-none ${
          isEmbedMode
            ? "mt-0"
            : `mt-6 ${
                layout === "grid-right"
                  ? "grid grid-cols-1 xl:grid-cols-[auto_1fr] gap-6"
                  : layout === "notation-right"
                    ? "grid grid-cols-1 xl:grid-cols-[1fr_auto] gap-6"
                    : "flex flex-col gap-6 items-start"
              }`
        }`}
      >
        {isEmbedMode ? (
          <div className="w-full" ref={setNotationExportEl}>
            <Notation
              instruments={instruments}
              grid={computedGrid}
              stickingAssignmentsByStep={stickingAssignmentsByStep}
              showNotationSticking={showNotationSticking}
              notationStickingView={notationStickingView}
              resolution={resolution}
              bars={bars}
              barsPerLine={barsPerLine}
              stepsPerBar={stepsPerBar}
              timeSig={timeSig}
              quarterSubdivisionsByBar={quarterSubdivisionsByBar}
              barStepOffsets={barStepOffsets}
              mergeRests={mergeRests}
              mergeNotes={mergeNotes}
              dottedNotes={dottedNotes}
              flatBeams={flatBeams}
            />
          </div>
        ) : layout === "notation-right" || layout === "notation-top" ? (
          <>
            <div className="w-full" ref={setNotationExportEl}>
              <Notation
                instruments={instruments}
                grid={computedGrid}
                stickingAssignmentsByStep={stickingAssignmentsByStep}
                showNotationSticking={showNotationSticking}
                notationStickingView={notationStickingView}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                quarterSubdivisionsByBar={quarterSubdivisionsByBar}
                barStepOffsets={barStepOffsets}
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
                quarterSubdivisionsByBar={quarterSubdivisionsByBar}
                normalizedTupletOverridesByBar={normalizedTupletOverridesByBar}
                barStepOffsets={barStepOffsets}
                cycleTupletAt={cycleTupletAt}
                gridBarsPerLine={gridBarsPerLine}
                cycleVelocity={cycleVelocity}
                toggleGhost={cycleArticulation}
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
                loopRepeats={loopRepeats}
                setLoopRule={setLoopRule}
                wrappedSelectionCells={wrappedSelectionCells}
                playhead={playback.playhead}
                moveSelectionByDelta={moveSelectionByDelta}
                legacySelectionEnabled={legacySelectionEnabled}
                moveModeDebugEnabled={moveModeDebugEnabled}
                playabilityWarningsEnabled={playabilityWarningsEnabled}
                playabilityWarningStepSet={playabilityWarningStepSet}
                stickingGuideEnabled={stickingGuideEnabled}
                showEditedSticking={showEditedSticking}
                stickingAssignmentsByStep={stickingAssignmentsByStep}
                stickingEditModeEnabled={stickingEditModeEnabled}
                stickingOverrides={stickingOverrides}
                onCycleStickingOverride={cycleStickingOverride}
                onDisableStickingEditMode={() => setStickingEditModeEnabled(false)}
                bakeLoopPreview={bakeLoopPreview}
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
                quarterSubdivisionsByBar={quarterSubdivisionsByBar}
                normalizedTupletOverridesByBar={normalizedTupletOverridesByBar}
                barStepOffsets={barStepOffsets}
                cycleTupletAt={cycleTupletAt}
                gridBarsPerLine={gridBarsPerLine}
                cycleVelocity={cycleVelocity}
                toggleGhost={cycleArticulation}
                selection={selection}
                setSelection={setSelection}
                loopRule={loopRule}
                loopRepeats={loopRepeats}
                setLoopRule={setLoopRule}
                wrappedSelectionCells={wrappedSelectionCells}
                playhead={playback.playhead}
                moveSelectionByDelta={moveSelectionByDelta}
                legacySelectionEnabled={legacySelectionEnabled}
                moveModeDebugEnabled={moveModeDebugEnabled}
                playabilityWarningsEnabled={playabilityWarningsEnabled}
                playabilityWarningStepSet={playabilityWarningStepSet}
                stickingGuideEnabled={stickingGuideEnabled}
                showEditedSticking={showEditedSticking}
                stickingAssignmentsByStep={stickingAssignmentsByStep}
                stickingEditModeEnabled={stickingEditModeEnabled}
                stickingOverrides={stickingOverrides}
                onCycleStickingOverride={cycleStickingOverride}
                onDisableStickingEditMode={() => setStickingEditModeEnabled(false)}
                bakeLoopPreview={bakeLoopPreview}
              />
            </div>
            </div>

            <div className="w-full" ref={setNotationExportEl}>
              <Notation
                instruments={instruments}
                grid={computedGrid}
                stickingAssignmentsByStep={stickingAssignmentsByStep}
                showNotationSticking={showNotationSticking}
                notationStickingView={notationStickingView}
                resolution={resolution}
                bars={bars}
                barsPerLine={barsPerLine}
                stepsPerBar={stepsPerBar}
                timeSig={timeSig}
                quarterSubdivisionsByBar={quarterSubdivisionsByBar}
                barStepOffsets={barStepOffsets}
                mergeRests={mergeRests}
                mergeNotes={mergeNotes}
                dottedNotes={dottedNotes}
                flatBeams={flatBeams}
              />
            </div>
          </>
        )}
      </main>

      <footer className={`${isEmbedMode ? "hidden" : "mt-6 pt-1"}`} data-loopui='1'>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <a
              href="/how-to-write-drum-notation.html"
              className="hover:text-neutral-300 underline underline-offset-2"
              title="How to write drum notation"
            >
              Guide
            </a>
            <span className="text-neutral-700">·</span>
            <a
              href="/drum-notation-cheat-sheet.html"
              className="hover:text-neutral-300 underline underline-offset-2"
              title="Drum notation cheat sheet"
            >
              Cheat Sheet
            </a>
            <span className="text-neutral-700">·</span>
            <a
              href="/drum-groove-notation-examples.html"
              className="hover:text-neutral-300 underline underline-offset-2"
              title="Drum groove notation examples"
            >
              Examples
            </a>
          </div>
          <button
            type="button"
            onClick={() => {
              setLegalTab("impressum");
              setIsLegalDialogOpen(true);
            }}
            className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
            title="Legal information"
          >
            Legal
          </button>
          <button
            type="button"
            onClick={() => setIsPreferencesDialogOpen(true)}
            className="text-xs text-neutral-500 hover:text-neutral-300 underline underline-offset-2"
            title="Preferences"
          >
            Preferences
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTapTempo}
              className="touch-none select-none px-3 py-1.5 rounded border text-sm bg-neutral-900 border-neutral-800 text-neutral-300 hover:bg-neutral-800/60"
              title="Tap tempo (starts after 3 taps)"
            >
              Tap
            </button>
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
        </div>
      </footer>

      {isBeatLibraryOpen && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          <div
            ref={beatLibraryPanelRef}
            className="w-full max-w-[44rem] max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5 pointer-events-auto shadow-2xl"
            style={{
              position: "absolute",
              left: beatLibraryPos.x,
              top: beatLibraryPos.y,
            }}
            onMouseDown={(e) => {
              // Keep normal controls interactive; dragging is only from the title bar.
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="flex items-center gap-3 cursor-move select-none"
                onMouseDown={(e) => {
                  const panel = e.currentTarget.closest(".pointer-events-auto");
                  if (!(panel instanceof HTMLElement)) return;
                  const rect = panel.getBoundingClientRect();
                  beatLibraryDragRef.current.dragging = true;
                  beatLibraryDragRef.current.offsetX = e.clientX - rect.left;
                  beatLibraryDragRef.current.offsetY = e.clientY - rect.top;
                }}
                title="Drag window"
              >
                <h2 className="text-base font-semibold">Beat Library</h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBeatLibraryTab("local")}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      beatLibraryTab === "local"
                        ? "border-neutral-700 text-white bg-neutral-800"
                        : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                    }`}
                  >
                    Local
                  </button>
                  <button
                    type="button"
                    onClick={() => setBeatLibraryTab("public")}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      beatLibraryTab === "public"
                        ? "border-neutral-700 text-white bg-neutral-800"
                        : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                    }`}
                  >
                    Public
                  </button>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBeatLibraryOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-2">
              <input
                ref={beatNameInputRef}
                type="text"
                value={beatNameDraft}
                onChange={(e) => setBeatNameDraft(e.target.value)}
                onKeyDown={async (e) => {
                  if (e.key !== "Enter") return;
                  e.preventDefault();
                  if (beatLibraryTab === "public") {
                    openPublicSubmitDialog();
                    return;
                  }
                  if (canUpdateLoadedLocalBeat) updateCurrentLoadedBeatLocal();
                  else saveCurrentBeatLocal();
                  setIsBeatLibraryOpen(false);
                }}
                placeholder="Beat name"
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm min-w-[180px]"
              />
              <select
                value={beatCategoryDraft}
                onChange={(e) => setBeatCategoryDraft(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                <option value="all">All categories</option>
                {BEAT_CATEGORY_OPTIONS.map((c) => (
                  <option key={`cat-${c}`} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={beatStyleDraft}
                onChange={(e) => setBeatStyleDraft(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
              >
                <option value="all">All styles</option>
                {BEAT_STYLE_OPTIONS.map((c) => (
                  <option key={`style-${c}`} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={saveCurrentBeatLocal}
                className="px-2.5 py-1 rounded border text-sm border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                title="Save to local beat library"
              >
                Save
              </button>
              <button
                type="button"
                onClick={updateCurrentLoadedBeatLocal}
                disabled={!canUpdateLoadedLocalBeat}
                className={`px-2.5 py-1 rounded border text-sm ${
                  canUpdateLoadedLocalBeat
                    ? "border-cyan-700 text-cyan-100 bg-cyan-900/20 hover:bg-cyan-800/30"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                }`}
                title={
                  canUpdateLoadedLocalBeat
                    ? "Update loaded local beat"
                    : isLoadedLocalBeatNameChanged
                      ? "Rename detected: use Save to create a new beat"
                      : "Load a local beat and change it to enable update"
                }
              >
                Update
              </button>
              <button
                type="button"
                onClick={openPublicSubmitDialog}
                className="px-2.5 py-1 rounded border text-sm border-neutral-800 text-neutral-500 bg-neutral-900/60 hover:bg-neutral-800/40"
                title="Submit to public beat library"
              >
                Submit public
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-neutral-400">Sort</span>
              <button
                type="button"
                onClick={cycleLibrarySort}
                className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
              >
                {getLibrarySortLabel(librarySort)}
              </button>
              <span className="text-xs text-neutral-400">Time sig</span>
              <select
                value={libraryTimeSigFilter}
                onChange={(e) => setLibraryTimeSigFilter(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs"
              >
                <option value="all">All</option>
                {allTimeSigCategories.map((ts) => (
                  <option key={`ts-${ts}`} value={ts}>
                    {ts}
                  </option>
                ))}
              </select>
              <span className="text-xs text-neutral-400">BPM</span>
              <div className="flex items-stretch overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onPointerDown={() => startLibraryBpmRepeat(-1)}
                  onPointerUp={stopLibraryBpmRepeat}
                  onPointerCancel={stopLibraryBpmRepeat}
                  onPointerLeave={stopLibraryBpmRepeat}
                  className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Decrease BPM filter value"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={cycleLibraryBpmFilterMode}
                  className="min-w-[64px] border-l border-r border-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-700/60"
                  title="Cycle BPM filter mode"
                >
                  {getBpmFilterLabel()}
                </button>
                <button
                  type="button"
                  onPointerDown={() => startLibraryBpmRepeat(1)}
                  onPointerUp={stopLibraryBpmRepeat}
                  onPointerCancel={stopLibraryBpmRepeat}
                  onPointerLeave={stopLibraryBpmRepeat}
                  className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Increase BPM filter value"
                >
                  +
                </button>
              </div>
              {beatLibraryTab === "public" && (
                <button
                  type="button"
                  onClick={refreshPublicLibrary}
                  className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
                >
                  Refresh
                </button>
              )}
            </div>

            {publicLibraryError && (
              <div className="mt-3 rounded border border-amber-700/70 bg-amber-950/30 px-2 py-1 text-xs text-amber-100 flex items-center justify-between gap-2">
                <span>{publicLibraryError}</span>
                <button
                  type="button"
                  onClick={() => setPublicLibraryError("")}
                  className="px-1 rounded border border-amber-700/60 text-amber-100 hover:bg-amber-800/40"
                  aria-label="Close beat library error"
                  title="Close"
                >
                  x
                </button>
              </div>
            )}

            <div className="mt-4 space-y-2">
              {(beatLibraryTab === "local" ? filteredLocalBeats : filteredPublicBeats).map((beat) => {
                const beatBpm = getBeatBpm(beat);
                return (
                  <div key={`beat-${beat.id}`} className="rounded border border-neutral-800 bg-neutral-950/40 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="text-sm text-white">
                          {beat.name || "Untitled Beat"}
                          {beat.composer ? (
                            <span className="ml-2 text-xs text-neutral-400">{`by ${beat.composer}`}</span>
                          ) : null}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-400">
                          {beat.createdAt ? (
                            <span className="inline-block w-[78px] text-neutral-600 tabular-nums">
                              {new Date(beat.createdAt).toLocaleDateString()}
                            </span>
                          ) : (
                            <span className="inline-block w-[78px] text-neutral-600">—</span>
                          )}
                          <span className="inline-block w-[40px] tabular-nums">{beat.timeSigCategory || "4/4"}</span>
                          <span className="inline-block w-[72px] tabular-nums">
                            {Number.isFinite(beatBpm) ? `${beatBpm} BPM` : "—"}
                          </span>
                          <span className="inline-block w-[72px] truncate">{beat.category || "Groove"}</span>
                          <span className="inline-block w-[108px] truncate">{beat.style || "—"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            applyImportedBeatPayload(beat.payload, `${beatLibraryTab}:${beat.id}:${beat.createdAt || ""}`);
                            if (beatLibraryTab === "local") {
                              setLoadedLocalBeatId(beat.id);
                              setBeatNameDraft(String(beat.name || ""));
                              setBeatCategoryDraft(String(beat.category || "Groove"));
                              setBeatStyleDraft(String(beat.style || "all"));
                            } else {
                              setLoadedLocalBeatId(null);
                            }
                          }}
                          className="px-2.5 py-1 rounded border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800/60"
                        >
                          Load
                        </button>
                        {beatLibraryTab === "local" && (
                          <button
                            type="button"
                            onClick={() =>
                              setLocalBeatsWithUndo((prev) => prev.filter((b) => b.id !== beat.id))
                            }
                            className="px-2.5 py-1 rounded border border-red-900 text-sm text-red-200 hover:bg-red-900/30"
                            aria-label="Delete beat"
                            title="Delete beat"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {beatLibraryTab === "public" && publicLibraryLoading && (
                <div className="text-xs text-neutral-400">Loading public library…</div>
              )}
              {beatLibraryTab === "local" && filteredLocalBeats.length === 0 && (
                <div className="text-xs text-neutral-500">No local beats saved yet.</div>
              )}
              {beatLibraryTab === "public" && !publicLibraryLoading && filteredPublicBeats.length === 0 && (
                <div className="text-xs text-neutral-500">No public beats yet.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {isArrangementOpen && (
        <div className="fixed inset-0 z-[88] pointer-events-none">
          <div
            ref={arrangementPanelRef}
            className={`w-full ${arrangementSourcesCollapsed || arrangementDetailsCollapsed ? "max-w-[36rem]" : "max-w-[68rem]"} max-h-[88vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5 pointer-events-auto shadow-2xl`}
            style={{
              position: "absolute",
              left: arrangementPos.x,
              top: arrangementPos.y,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="cursor-move select-none"
                onMouseDown={(e) => {
                  const panel = e.currentTarget.closest(".pointer-events-auto");
                  if (!(panel instanceof HTMLElement)) return;
                  const rect = panel.getBoundingClientRect();
                  arrangementDragRef.current.dragging = true;
                  arrangementDragRef.current.offsetX = e.clientX - rect.left;
                  arrangementDragRef.current.offsetY = e.clientY - rect.top;
                }}
                title="Drag window"
              >
                <h3 className="text-base font-semibold">Library</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setArrangementSourcesCollapsed((v) => {
                      if (!v && arrangementDetailsCollapsed) return v;
                      return !v;
                    })
                  }
                  className={`px-3 py-1.5 rounded border text-sm ${
                    arrangementSourcesCollapsed
                      ? "border-neutral-800 text-neutral-500 bg-neutral-900/60"
                      : "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                  }`}
                  title={arrangementSourcesCollapsed ? "Show beats panel" : "Hide beats panel"}
                >
                  Beats
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setArrangementDetailsCollapsed((v) => {
                      if (!v && arrangementSourcesCollapsed) return v;
                      return !v;
                    })
                  }
                  className={`px-3 py-1.5 rounded border text-sm ${
                    arrangementDetailsCollapsed
                      ? "border-neutral-800 text-neutral-500 bg-neutral-900/60"
                      : "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                  }`}
                  title={arrangementDetailsCollapsed ? "Show arrangement panel" : "Hide arrangement panel"}
                >
                  Arrangement
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setIsArrangementNotationOpen((v) => {
                      const next = !v;
                      if (next) {
                        setArrangementSourcesCollapsed(true);
                        setArrangementDetailsCollapsed(false);
                      }
                      return next;
                    })
                  }
                  className={`px-3 py-1.5 rounded border text-sm ${
                    isArrangementNotationOpen
                      ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                      : "border-neutral-800 text-neutral-500 bg-neutral-900/60"
                  }`}
                  title={isArrangementNotationOpen ? "Hide arrangement notation" : "Show arrangement notation"}
                >
                  Notation
                </button>
                <button
                  type="button"
                  onClick={() => setIsArrangementOpen(false)}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-neutral-300">
              <span className="rounded border border-neutral-700 px-2 py-1">{`Total bars: ${arrangementTotals.totalBars}`}</span>
              <span className="rounded border border-neutral-700 px-2 py-1">
                {`Est. length: ${Math.floor(Math.max(0, Math.round(arrangementTotals.totalSeconds)) / 60)}:${String(
                  Math.max(0, Math.round(arrangementTotals.totalSeconds)) % 60
                ).padStart(2, "0")}`}
              </span>
              {normalizedArrangementSelection ? (
                <span className="rounded border border-emerald-700/70 px-2 py-1 text-emerald-200">
                  {`Loop selection: ${normalizedArrangementSelection.start + 1}-${normalizedArrangementSelection.end + 1}`}
                </span>
              ) : null}
            </div>

            <div className={`mt-4 grid grid-cols-1 ${!arrangementSourcesCollapsed && !arrangementDetailsCollapsed ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]" : ""} gap-4`}>
              {!arrangementSourcesCollapsed && (
              <div
                className={`rounded border border-neutral-800 bg-neutral-950/40 p-3 ${
                  arrangementDetailsCollapsed ? "w-full max-w-[36rem] justify-self-start" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-neutral-200">Beats</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setArrangementSourceTab("local")}
                      className={`px-2.5 py-1 rounded border text-xs ${
                        arrangementSourceTab === "local"
                          ? "border-neutral-700 text-white bg-neutral-800"
                          : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                      }`}
                    >
                      Local
                    </button>
                    <button
                      type="button"
                      onClick={() => setArrangementSourceTab("public")}
                      className={`px-2.5 py-1 rounded border text-xs ${
                        arrangementSourceTab === "public"
                          ? "border-neutral-700 text-white bg-neutral-800"
                          : "border-neutral-800 text-neutral-400 bg-neutral-900/60"
                      }`}
                    >
                      Public
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-end gap-2">
                  <input
                    type="text"
                    value={beatNameDraft}
                    onChange={(e) => setBeatNameDraft(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={async (e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      if (arrangementSourceTab === "public") {
                        openPublicSubmitDialog();
                        return;
                      }
                      if (canUpdateLoadedLocalBeat) updateCurrentLoadedBeatLocal();
                      else saveCurrentBeatLocal();
                    }}
                    placeholder="Beat name"
                    className="min-w-[180px] flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={canUpdateLoadedLocalBeat ? updateCurrentLoadedBeatLocal : saveCurrentBeatLocal}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      arrangementSourceTab === "local"
                        ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                        : "border-neutral-800 text-neutral-500 bg-neutral-900/60"
                    }`}
                    title={canUpdateLoadedLocalBeat ? "Update loaded local beat" : "Save to local beat library"}
                    disabled={arrangementSourceTab !== "local"}
                  >
                    {canUpdateLoadedLocalBeat ? "Update" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={openPublicSubmitDialog}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      arrangementSourceTab === "public"
                        ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                        : "border-neutral-800 text-neutral-500 bg-neutral-900/60"
                    }`}
                    title="Submit to public beat library"
                  >
                    Submit public
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-400">Sort</span>
                  <button
                    type="button"
                    onClick={cycleLibrarySort}
                    className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
                  >
                    {getLibrarySortLabel(librarySort)}
                  </button>
                  <span className="text-xs text-neutral-400">Time sig</span>
                  <select
                    value={libraryTimeSigFilter}
                    onChange={(e) => setLibraryTimeSigFilter(e.target.value)}
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs"
                  >
                    <option value="all">All</option>
                    {allTimeSigCategories.map((ts) => (
                      <option key={`arr-ts-${ts}`} value={ts}>
                        {ts}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs text-neutral-400">BPM</span>
                  <div className="flex items-stretch overflow-hidden rounded border border-neutral-700 bg-neutral-800">
                    <button
                      type="button"
                      onPointerDown={() => startLibraryBpmRepeat(-1)}
                      onPointerUp={stopLibraryBpmRepeat}
                      onPointerCancel={stopLibraryBpmRepeat}
                      onPointerLeave={stopLibraryBpmRepeat}
                      className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={cycleLibraryBpmFilterMode}
                      className="min-w-[64px] border-l border-r border-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-700/60"
                      title="Cycle BPM filter mode"
                    >
                      {getBpmFilterLabel()}
                    </button>
                    <button
                      type="button"
                      onPointerDown={() => startLibraryBpmRepeat(1)}
                      onPointerUp={stopLibraryBpmRepeat}
                      onPointerCancel={stopLibraryBpmRepeat}
                      onPointerLeave={stopLibraryBpmRepeat}
                      className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60 active:bg-neutral-700"
                    >
                      +
                    </button>
                  </div>
                  {arrangementSourceTab === "public" && (
                    <button
                      type="button"
                      onClick={refreshPublicLibrary}
                      className="px-2 py-0.5 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/50"
                    >
                      Refresh
                    </button>
                  )}
                </div>
                {publicLibraryError && (
                  <div className="mt-3 rounded border border-amber-700/70 bg-amber-950/30 px-2 py-1 text-xs text-amber-100 flex items-center justify-between gap-2">
                    <span>{publicLibraryError}</span>
                    <button
                      type="button"
                      onClick={() => setPublicLibraryError("")}
                      className="px-1 rounded border border-amber-700/60 text-amber-100 hover:bg-amber-800/40"
                      aria-label="Close source error"
                      title="Close"
                    >
                      x
                    </button>
                  </div>
                )}
                {!arrangementSourcesCollapsed ? (
                  <div className="mt-3 max-h-[52vh] overflow-auto space-y-2 pr-1">
                    {arrangementSourceBeats.map((beat) => {
                      const beatBpm = getBeatBpm(beat);
                      const sourceLabel = arrangementSourceTab === "public" ? "public" : "local";
                      return (
                        <div key={`arr-src-${sourceLabel}-${beat.id}`} className="rounded border border-neutral-800 bg-neutral-900/40 px-2.5 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="text-sm text-white truncate">{beat.name || "Untitled Beat"}</div>
                              <div className="text-xs text-neutral-400 truncate">
                                {(() => {
                                  const beatBars = Math.max(1, Number(beat?.payload?.bars) || 1);
                                  return (beat.timeSigCategory || "4/4") +
                                    (Number.isFinite(beatBpm) ? ` · ${beatBpm} BPM` : "") +
                                    ` · ${beatBars} ${beatBars === 1 ? "bar" : "bars"}`;
                                })()}
                              </div>
                            </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                applyImportedBeatPayload(
                                  beat.payload,
                                  `${arrangementSourceTab}:${beat.id}:${beat.createdAt || ""}`
                                );
                                if (arrangementSourceTab === "local") {
                                  setLoadedLocalBeatId(beat.id);
                                  setBeatNameDraft(String(beat.name || ""));
                                  setBeatCategoryDraft(String(beat.category || "Groove"));
                                  setBeatStyleDraft(String(beat.style || "all"));
                                } else {
                                  setLoadedLocalBeatId(null);
                                }
                              }}
                              className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-200 hover:bg-neutral-800/60"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => arrangementAddBeat(arrangementSourceTab, beat.id)}
                              className="px-2 py-1 rounded border border-neutral-700 text-xs text-white bg-neutral-800 hover:bg-neutral-700/60"
                            >
                              Add
                            </button>
                            {arrangementSourceTab === "local" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setLocalBeatsWithUndo((prev) =>
                                    prev.filter((b) => String(b.id) !== String(beat.id))
                                  )
                                }
                                className="px-2 py-1 rounded border border-red-900 text-xs text-red-200 hover:bg-red-900/30"
                                aria-label="Delete beat"
                                title="Delete beat"
                              >
                                ×
                              </button>
                            )}
                          </div>
                          </div>
                        </div>
                      );
                    })}
                    {arrangementSourceTab === "public" && publicLibraryLoading && (
                      <div className="text-xs text-neutral-400">Loading public library…</div>
                    )}
                    {arrangementSourceBeats.length === 0 && (
                      <div className="text-xs text-neutral-500">No beats in this source with current filters.</div>
                    )}
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-neutral-500">Beat sources collapsed.</div>
                )}
              </div>
              )}

              {!arrangementDetailsCollapsed && (
              <div
                className={`rounded border border-neutral-800 bg-neutral-950/40 p-3 ${
                  arrangementSourcesCollapsed ? "w-full max-w-[36rem] justify-self-start" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-neutral-200">Arrangement</div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (arrangementPlaybackEnabled && playback.isPlaying) stopArrangementPlayback();
                        else startArrangementPlayback();
                      }}
                      disabled={arrangementPlayableEntries.length < 1}
                      className={`px-2 py-1 rounded border text-xs ${
                        arrangementPlaybackEnabled && playback.isPlaying
                          ? "border-neutral-600 text-white bg-neutral-800"
                          : arrangementPlayableEntries.length > 0
                            ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                            : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                      }`}
                    >
                      {arrangementPlaybackEnabled && playback.isPlaying ? "Stop" : "Play arrangement"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setArrangementSelection(null);
                        setArrangementSelectionAnchor(null);
                      }}
                      className="px-2 py-1 rounded border border-neutral-800 text-xs text-neutral-400 hover:bg-neutral-800/50"
                    >
                      Clear selection
                    </button>
                    <button
                      type="button"
                      onClick={() => setArrangementItemsWithUndo([])}
                      className="px-2 py-1 rounded border border-neutral-800 text-xs text-neutral-400 hover:bg-neutral-800/50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={arrangementNameDraft}
                    onChange={(e) => setArrangementNameDraft(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="Arrangement name"
                    className="min-w-[180px] flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={saveArrangementSnapshot}
                    disabled={arrangementItems.length < 1}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      arrangementItems.length > 0
                        ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                        : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                    }`}
                    title="Save current song arrangement"
                  >
                    Save
                  </button>
                </div>
                {savedArrangements.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedSavedArrangementEntry?.id || ""}
                        onChange={(e) => setLoadedArrangementId(e.target.value || null)}
                        className="min-w-0 flex-1 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-white"
                      >
                        {savedArrangements.map((entry) => (
                          <option key={`arr-save-opt-${entry.id}`} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedSavedArrangementEntry) return;
                          loadSavedArrangement(selectedSavedArrangementEntry);
                        }}
                        disabled={!selectedSavedArrangementEntry}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          selectedSavedArrangementEntry
                            ? "border-neutral-700 text-neutral-200 hover:bg-neutral-800/60"
                            : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                        }`}
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedSavedArrangementEntry) return;
                          deleteSavedArrangement(selectedSavedArrangementEntry.id);
                        }}
                        disabled={!selectedSavedArrangementEntry}
                        className={`px-2 py-1 rounded border text-[11px] ${
                          selectedSavedArrangementEntry
                            ? "border-red-900 text-red-200 hover:bg-red-900/30"
                            : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                        }`}
                        aria-label="Delete arrangement"
                        title="Delete arrangement"
                      >
                        ×
                      </button>
                    </div>
                    <div className="text-[10px] text-neutral-500">
                      {selectedSavedArrangementEntry?.updatedAt
                        ? `Updated ${new Date(selectedSavedArrangementEntry.updatedAt).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                )}
                <div className="mt-2 text-[11px] text-neutral-500">Click rows to build a contiguous loop block. Click selected rows again to shrink/clear. Play loops selected range.</div>
                <div ref={arrangementListRef} className="mt-3 max-h-[52vh] overflow-auto pr-1">
                  <DndContext
                    sensors={arrangementOrderSensors}
                    collisionDetection={closestCenter}
                    onDragEnd={onArrangementOrderDragEnd}
                    modifiers={[restrictArrangementDragToList]}
                  >
                    <SortableContext
                      items={arrangementRows.map((row) => row.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <div className="space-y-2">
                        {arrangementRows.map((row, idx) => (
                          <SortableArrangementRow
                            key={`arr-row-${row.id}`}
                            row={row}
                            index={idx}
                            isPlaying={arrangementPlaybackEnabled && idx === activeArrangementPlayingRowIndex}
                            isSelected={Boolean(
                              normalizedArrangementSelection &&
                                idx >= normalizedArrangementSelection.start &&
                                idx <= normalizedArrangementSelection.end
                            )}
                            onSelect={() => handleArrangementRowSelect(idx)}
                            onPlay={() => startArrangementPlayback(idx)}
                            onRepeatDown={() => arrangementNudgeRepeats(row.id, -1)}
                            onRepeatUp={() => arrangementNudgeRepeats(row.id, 1)}
                            onRemove={() => arrangementRemoveRow(row.id)}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                  {arrangementRows.length === 0 && (
                    <div className="text-xs text-neutral-500">
                      No sections yet. Add beats from the source list to build your song form.
                    </div>
                  )}
                </div>
              </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isArrangementNotationOpen && (
        <div className="fixed inset-0 z-[87] pointer-events-none">
          <div
            ref={arrangementNotationPanelRef}
            className="w-full max-w-[65rem] max-h-[88vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5 pointer-events-auto shadow-2xl"
            style={{
              position: "absolute",
              left: arrangementNotationPos.x,
              top: arrangementNotationPos.y,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <div
                className="cursor-move select-none"
                onMouseDown={(e) => {
                  const panel = e.currentTarget.closest(".pointer-events-auto");
                  if (!(panel instanceof HTMLElement)) return;
                  const rect = panel.getBoundingClientRect();
                  arrangementNotationDragRef.current.dragging = true;
                  arrangementNotationDragRef.current.offsetX = e.clientX - rect.left;
                  arrangementNotationDragRef.current.offsetY = e.clientY - rect.top;
                }}
                title="Drag window"
              >
                <h3 className="text-base font-semibold">Arrangement Notation</h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                  <button
                    type="button"
                    onClick={() => setArrangementNotationViewMode("sections")}
                    className={`px-3 py-1 text-xs ${
                      arrangementNotationViewMode === "sections"
                        ? "bg-neutral-700 text-white"
                        : "text-neutral-300 hover:bg-neutral-700/60"
                    }`}
                  >
                    Sections
                  </button>
                  <button
                    type="button"
                    onClick={() => setArrangementNotationViewMode("sheet")}
                    className={`px-3 py-1 text-xs border-l border-neutral-700 ${
                      arrangementNotationViewMode === "sheet"
                        ? "bg-neutral-700 text-white"
                        : "text-neutral-300 hover:bg-neutral-700/60"
                    }`}
                  >
                    Sheet
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (arrangementPlaybackEnabled && playback.isPlaying) stopArrangementPlayback();
                    else startArrangementPlayback();
                  }}
                  disabled={arrangementPlayableEntries.length < 1}
                  className={`px-3 py-1.5 rounded border text-sm ${
                    arrangementPlaybackEnabled && playback.isPlaying
                      ? "border-neutral-600 text-white bg-neutral-800"
                      : arrangementPlayableEntries.length > 0
                        ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                        : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                  }`}
                >
                  {arrangementPlaybackEnabled && playback.isPlaying ? "Stop" : "Play"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsArrangementNotationOpen(false)}
                  className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="mt-3 w-full max-w-none aspect-[210/297] rounded border border-neutral-800 bg-neutral-950/40 overflow-visible p-3">
              <div className="mb-3 text-center text-base font-semibold text-neutral-100">
                {arrangementNameDraft.trim() || "Arrangement"}
              </div>
              {arrangementNotationViewMode === "sections" ? (
                <div className="space-y-4">
                  {arrangementNotationSections.map((section) => (
                    <div key={`arr-notation-${section.id}`} className="w-full rounded border border-neutral-800 bg-neutral-900/40 p-3">
                      <div className="mb-2 text-xs text-neutral-300">
                        {`${section.index + 1}. ${section.name} · ${section.sectionBars} ${section.sectionBars === 1 ? "bar" : "bars"} (${section.repeats}x ${section.beatBars} ${section.beatBars === 1 ? "bar" : "bars"}) · ${section.beatTimeSig}` +
                          (Number.isFinite(section.beatBpm) ? ` · ${section.beatBpm} BPM` : "")}
                      </div>
                      <div className="flex justify-center">
                        <Notation
                          instruments={section.notation.instruments}
                          grid={section.notation.grid}
                          stickingAssignmentsByStep={section.stickingAssignments || []}
                          showNotationSticking={showNotationSticking}
                          notationStickingView={notationStickingView}
                          resolution={section.notation.resolution}
                          bars={section.notation.bars}
                          barsPerLine={4}
                          stepsPerBar={Math.max(
                            1,
                            Number(
                              (section.notation.barStepOffsets?.[1] ?? 0) -
                                (section.notation.barStepOffsets?.[0] ?? 0)
                            ) || section.notation.resolution
                          )}
                          timeSig={section.notation.timeSig}
                          quarterSubdivisionsByBar={section.notation.quarterSubdivisionsByBar}
                          barStepOffsets={section.notation.barStepOffsets}
                          mergeRests={mergeRests}
                          mergeNotes={mergeNotes}
                          dottedNotes={dottedNotes}
                          flatBeams={flatBeams}
                          justifySystems={true}
                          targetContentWidth={816}
                          sectionMarkers={section.sectionMarkers || []}
                          tempoMarkers={section.tempoMarkers || []}
                          showSystemBarNumbers={true}
                          barNumberOffset={section.startBarOffset || 0}
                          activeBarIndices={
                            activeArrangementGlobalBarIndex >= section.startBarOffset &&
                            activeArrangementGlobalBarIndex < section.startBarOffset + section.sectionBars
                              ? [activeArrangementGlobalBarIndex - section.startBarOffset]
                              : []
                          }
                        />
                      </div>
                    </div>
                  ))}
                  {arrangementNotationSections.length < 1 && (
                    <div className="text-xs text-neutral-500">
                      No arrangement sections with notation yet.
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {arrangementNotationSheetChunks.map((chunk, chunkIdx) => (
                    <div key={`arr-sheet-${chunkIdx}`} className="w-full rounded border border-neutral-800 bg-neutral-900/40 p-3 flex justify-center">
                      <Notation
                        instruments={chunk.instruments}
                        grid={chunk.grid}
                        stickingAssignmentsByStep={chunk.stickingAssignments || []}
                        showNotationSticking={showNotationSticking}
                        notationStickingView={notationStickingView}
                        resolution={chunk.resolution}
                        bars={chunk.bars}
                        barsPerLine={4}
                        stepsPerBar={Math.max(
                          1,
                          Number((chunk.barStepOffsets?.[1] ?? 0) - (chunk.barStepOffsets?.[0] ?? 0)) || chunk.resolution
                        )}
                        timeSig={chunk.timeSig}
                        quarterSubdivisionsByBar={chunk.quarterSubdivisionsByBar}
                        barStepOffsets={chunk.barStepOffsets}
                        mergeRests={mergeRests}
                        mergeNotes={mergeNotes}
                        dottedNotes={dottedNotes}
                        flatBeams={flatBeams}
                        justifySystems={true}
                        targetContentWidth={816}
                        sectionMarkers={chunk.sectionMarkers || []}
                        tempoMarkers={chunk.tempoMarkers || []}
                        showSystemBarNumbers={true}
                        barNumberOffset={chunk.startBarOffset || 0}
                        activeBarIndices={
                          activeArrangementGlobalBarIndex >= chunk.startBarOffset &&
                          activeArrangementGlobalBarIndex < chunk.startBarOffset + chunk.bars
                            ? [activeArrangementGlobalBarIndex - chunk.startBarOffset]
                            : []
                        }
                      />
                    </div>
                  ))}
                  {arrangementNotationSheetChunks.length < 1 && (
                    <div className="text-xs text-neutral-500">
                      No arrangement notation to render.
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {isKitEditorOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => {
            if (isSaveAsDialogOpen) {
              setIsSaveAsDialogOpen(false);
              setSaveAsName("");
              return;
            }
            setIsKitEditorOpen(false);
            setPendingRemoval(null);
          }}
        >
          <div
            className="w-full max-w-[24rem] max-h-[90vh] overflow-auto rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
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
              <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                <button
                  type="button"
                  onClick={() => stepPreset(-1)}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Previous preset"
                >
                  −
                </button>
                <input
                  type="text"
                  value={presetNameInlineDraft}
                  readOnly={!selectedSavedPreset}
                  onFocus={(e) => {
                    if (!selectedSavedPreset) return;
                    e.currentTarget.select();
                  }}
                  onChange={(e) => {
                    if (!selectedSavedPreset) return;
                    setPresetNameInlineDraft(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (!selectedSavedPreset) return;
                    if (e.key === "Enter") {
                      e.preventDefault();
                      renameSelectedPresetInline();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setPresetNameInlineDraft(selectedSavedPreset.label);
                    }
                  }}
                  className={`min-w-[112px] px-3 py-1 text-sm text-center text-white bg-neutral-800 border-l border-r border-neutral-700 outline-none ${
                    selectedSavedPreset ? "cursor-text" : "cursor-default"
                  }`}
                  title={selectedSavedPreset ? "Edit name and press Enter to save" : "Built-in presets cannot be renamed"}
                />
                <button
                  type="button"
                  onClick={() => stepPreset(1)}
                  className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                  aria-label="Next preset"
                >
                  +
                </button>
              </div>
                <button
                  type="button"
                  onClick={() => {
                    setSaveAsName("");
                    setIsSaveAsDialogOpen(true);
                  }}
                  className="px-2.5 py-1 rounded border text-sm border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                  title="Save current drumkit as a new preset"
              >
                Save As
              </button>
              <button
                type="button"
                onClick={deleteSelectedPreset}
                disabled={!selectedSavedPreset}
                className={`px-2.5 py-1 rounded border text-sm ${
                  selectedSavedPreset
                    ? "border-red-900 text-red-200 hover:bg-red-900/30"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                }`}
                title={selectedSavedPreset ? "Delete selected preset" : "Only saved presets can be deleted"}
              >
                Delete
              </button>
              <button
                type="button"
                onClick={() => setKeepTracksWithNotesEnabled((v) => !v)}
                className={`px-2.5 py-1 rounded border text-sm ${
                  keepTracksWithNotesEnabled
                    ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 hover:bg-neutral-800/40"
                }`}
                title="Automatically keep tracks with notes"
              >
                Keep tracks with notes
              </button>
            </div>

            {isSaveAsDialogOpen && (
              <div className="mt-3 rounded-lg border border-neutral-700 bg-neutral-950/50 p-3" onMouseDown={(e) => e.stopPropagation()}>
                <div className="text-sm text-neutral-200 mb-2">Save Preset As</div>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={saveAsName}
                    onChange={(e) => setSaveAsName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        savePresetAsNew();
                      }
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setIsSaveAsDialogOpen(false);
                        setSaveAsName("");
                      }
                    }}
                    placeholder="Preset name"
                    className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-sm"
                  />
                  <button
                    type="button"
                    onClick={savePresetAsNew}
                    disabled={!saveAsName.trim()}
                    className={`px-2.5 py-1 rounded border text-sm ${
                      saveAsName.trim()
                        ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                        : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                    }`}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsSaveAsDialogOpen(false);
                      setSaveAsName("");
                    }}
                    className="px-2.5 py-1 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {pendingRemoval && (
              <div className="mt-4 rounded-lg border border-amber-700/70 bg-amber-950/30 p-3">
                <div className="text-sm text-amber-200">
                  {(INSTRUMENT_BY_ID[pendingRemoval.instId]?.label || pendingRemoval.instId) +
                    " has notes."}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
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
                    Move notes
                  </button>
                  <button
                    type="button"
                    onClick={confirmRemoveDeleteNotes}
                    className="px-3 py-1.5 rounded border border-amber-600 text-sm text-amber-100 hover:bg-amber-800/40"
                  >
                    Delete notes
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

            <div className="mt-5 grid grid-cols-[1.35fr_0.65fr] gap-1">
              <div>
                <div className="text-sm font-medium mb-2">Kit Order</div>
                <div className="text-xs text-neutral-400 mb-2">Drag rows to reorder instruments.</div>
                <DndContext
                  sensors={kitOrderSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={onKitOrderDragEnd}
                  modifiers={[restrictKitDragToList]}
                >
                <SortableContext items={kitInstrumentIds} strategy={verticalListSortingStrategy}>
                <div ref={kitOrderListRef} className="space-y-2">
                  {kitInstrumentIds.map((id, idx) => {
                    const inst = INSTRUMENT_BY_ID[id];
                    if (!inst) return null;
                    return (
                      <SortableKitOrderRow
                        key={`kit-${id}`}
                        id={id}
                        index={idx}
                        label={inst.label}
                        onRemove={() => requestRemoveInstrument(id)}
                      />
                    );
                  })}
                </div>
                </SortableContext>
                </DndContext>
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
            <h3 className="text-base font-semibold">Remove Notes</h3>
            <p className="mt-2 text-sm text-neutral-300">
              Switching to <span>{PRESET_LABELS[pendingPresetChange.presetName] || pendingPresetChange.presetName}</span> would remove tracks that contain notes:
            </p>
            <div className="mt-2 text-sm text-amber-200">
              {pendingPresetChange.removedWithNotes
                .map((id) => INSTRUMENT_BY_ID[id]?.label || id)
                .join(", ")}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={confirmPresetKeepNotedTracks}
                className="px-3 py-1.5 rounded border border-cyan-600 text-sm text-cyan-100 hover:bg-cyan-800/30"
              >
                {keepTracksWithNotesEnabled ? "Keep tracks with notes (Default)" : "Keep tracks with notes"}
              </button>
              <button
                type="button"
                onClick={confirmPresetDeleteAnyway}
                className="px-3 py-1.5 rounded border border-red-700 text-sm text-red-100 hover:bg-red-900/30"
              >
                {keepTracksWithNotesEnabled ? "Remove anyway" : "Remove anyway (Default)"}
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

      {isShareActionsDialogOpen && (
        <div
          className="fixed inset-0 z-[88] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsShareActionsDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Share</h3>
            <div className="mt-4 grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={handleShareLink}
                className={`px-3 py-2 rounded border text-sm text-left ${
                  shareCopied
                    ? "border-neutral-600 text-white bg-neutral-800"
                    : "border-neutral-700 text-neutral-200 hover:bg-neutral-800/60"
                }`}
                title="Copy shareable groove link"
              >
                {shareCopied ? `Link copied (${shareLinkType || "Long"})` : "Share link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsShareActionsDialogOpen(false);
                  setIsPrintDialogOpen(true);
                }}
                className="px-3 py-2 rounded border border-neutral-700 text-sm text-left text-neutral-200 hover:bg-neutral-800/60"
                title="Print the current notation"
              >
                Print
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsShareActionsDialogOpen(false);
                  setIsMidiDialogOpen(true);
                }}
                className="px-3 py-2 rounded border border-neutral-700 text-sm text-left text-neutral-200 hover:bg-neutral-800/60"
                title="Export current pattern as MIDI file"
              >
                Export MIDI
              </button>
            </div>
            <div className="mt-4 flex items-center justify-end">
              <button
                type="button"
                onClick={() => setIsShareActionsDialogOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {isPrintDialogOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsPrintDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Print Notation</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Title</span>
                <input
                  ref={printTitleInputRef}
                  type="text"
                  value={printTitle}
                  onChange={(e) => setPrintTitle(e.target.value)}
                  placeholder="Untitled"
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Composer</span>
                <input
                  ref={printComposerInputRef}
                  type="text"
                  value={printComposer}
                  onChange={(e) => setPrintComposer(e.target.value)}
                  placeholder="Composer"
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={() => setPrintWatermarkEnabled((v) => !v)}
                className={`w-fit px-2.5 py-1 rounded border text-sm ${
                  !printWatermarkEnabled
                    ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 hover:bg-neutral-800/40"
                }`}
                title="Show footer watermark in exported PDF"
              >
                Disable watermark
              </button>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPrintDialogOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePrintSubmit}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-white bg-neutral-800 hover:bg-neutral-700/60"
              >
                Print
              </button>
            </div>
          </div>
        </div>
      )}

      {isPublicSubmitDialogOpen && (
        <div
          className="fixed inset-0 z-[89] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsPublicSubmitDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Submit Public Beat</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Title</span>
                <input
                  ref={publicSubmitTitleInputRef}
                  type="text"
                  value={publicSubmitTitle}
                  onChange={(e) => setPublicSubmitTitle(e.target.value)}
                  placeholder="Untitled"
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Composer</span>
                <input
                  ref={publicSubmitComposerInputRef}
                  type="text"
                  value={publicSubmitComposer}
                  onChange={(e) => setPublicSubmitComposer(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    await confirmPublicSubmit();
                  }}
                  placeholder="Composer"
                  disabled={Boolean(lockedPublicComposer)}
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Category</span>
                <select
                  value={publicSubmitCategory}
                  onChange={(e) => setPublicSubmitCategory(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                >
                  <option value="all">Select category</option>
                  {DRUM_BEAT_CATEGORIES.map((c) => (
                    <option key={`public-submit-category-${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Style</span>
                <select
                  value={publicSubmitStyle}
                  onChange={(e) => setPublicSubmitStyle(e.target.value)}
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                >
                  <option value="all">Select style</option>
                  {DRUM_BEAT_STYLES.map((c) => (
                    <option key={`public-submit-style-${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <div className="text-xs text-amber-200/90">
                {lockedPublicComposer
                  ? `Composer is locked for this browser: ${lockedPublicComposer}`
                  : "Warning: Composer can only be set once on this browser for public uploads."}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsPublicSubmitDialogOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPublicSubmit}
                disabled={
                  !publicSubmitTitle.trim() ||
                  !(lockedPublicComposer || publicSubmitComposer.trim()) ||
                  publicSubmitCategory === "all" ||
                  publicSubmitStyle === "all"
                }
                className={`px-3 py-1.5 rounded border text-sm ${
                  publicSubmitTitle.trim() &&
                  (lockedPublicComposer || publicSubmitComposer.trim()) &&
                  publicSubmitCategory !== "all" &&
                  publicSubmitStyle !== "all"
                    ? "border-neutral-700 text-white bg-neutral-800 hover:bg-neutral-700/60"
                    : "border-neutral-800 text-neutral-500 bg-neutral-900/60 cursor-not-allowed"
                }`}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {isMidiDialogOpen && (
        <div
          className="fixed inset-0 z-[91] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsMidiDialogOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold">Export MIDI</h3>
            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Title</span>
                <input
                  type="text"
                  value={printTitle}
                  onChange={(e) => setPrintTitle(e.target.value)}
                  placeholder="Untitled"
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="text-sm text-neutral-300 flex flex-col gap-1">
                <span>Composer</span>
                <input
                  type="text"
                  value={printComposer}
                  onChange={(e) => setPrintComposer(e.target.value)}
                  placeholder="Composer"
                  className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1.5 text-sm text-white"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsMidiDialogOpen(false)}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-neutral-300 hover:bg-neutral-800/60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    exportDrumMidi({
                      grid: computedGrid,
                      instruments,
                      columns,
                      resolution,
                      bpm,
                      timeSig,
                      title: printTitle.trim(),
                      composer: printComposer.trim(),
                      filename: printTitle.trim() || "Drum Notation",
                    });
                    setIsMidiDialogOpen(false);
                  } catch (e) {
                    console.error(e);
                    alert(e?.message || "Failed to export MIDI");
                  }
                }}
                className="px-3 py-1.5 rounded border border-neutral-700 text-sm text-white bg-neutral-800 hover:bg-neutral-700/60"
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {isLegalDialogOpen && (
        <div
          className="fixed inset-0 z-[92] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsLegalDialogOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Legal</h3>
              <button
                type="button"
                onClick={() => setIsLegalDialogOpen(false)}
                className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLegalTab("impressum")}
                className={`px-2.5 py-1 rounded border text-sm ${
                  legalTab === "impressum"
                    ? "border-neutral-600 bg-neutral-800 text-white"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800/50"
                }`}
              >
                Impressum
              </button>
              <button
                type="button"
                onClick={() => setLegalTab("privacy")}
                className={`px-2.5 py-1 rounded border text-sm ${
                  legalTab === "privacy"
                    ? "border-neutral-600 bg-neutral-800 text-white"
                    : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:bg-neutral-800/50"
                }`}
              >
                Privacy
              </button>
            </div>
            {legalTab === "impressum" ? (
              <div className="mt-4 text-sm text-neutral-200 space-y-3 leading-relaxed">
                <p className="font-medium">Impressum</p>
                <p>
                  Arne Hertstein
                  <br />
                  Rathenaustraße 3
                  <br />
                  55131 Mainz
                  <br />
                  E-Mail:{" "}
                  {showLegalEmail ? (
                    <span>breakdowndrums@gmail.com</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLegalEmail(true)}
                      className="underline underline-offset-2 text-neutral-200 hover:text-white"
                    >
                      Click to reveal email
                    </button>
                  )}
                </p>
              </div>
            ) : (
              <div className="mt-4 text-sm text-neutral-200 space-y-3 leading-relaxed">
                <p className="font-medium">Datenschutzerklärung / Privacy Policy (GDPR)</p>
                <p>
                  Verantwortlich / Controller:
                  <br />
                  Arne Hertstein, Rathenaustraße 3, 55131 Mainz,
                  <br />
                  {showLegalEmail ? (
                    <span>breakdowndrums@gmail.com</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLegalEmail(true)}
                      className="underline underline-offset-2 text-neutral-200 hover:text-white"
                    >
                      Click to reveal email
                    </button>
                  )}
                </p>
                <p>
                  Hosting:
                  <br />
                  This site is hosted via Vercel. When visiting the site, technically required server/CDN logs
                  (e.g. IP address, timestamp, requested resource, user agent) may be processed to provide, secure,
                  and operate the service (Art. 6(1)(f) GDPR).
                </p>
                <p>
                  Cookies:
                  <br />
                  The app itself does not set non-essential tracking or marketing cookies.
                </p>
                <p>
                  LocalStorage:
                  <br />
                  The app stores user-created preset data in your browser under the key
                  <span className="mx-1 font-mono">drum-grid-user-presets-v1</span>
                  to keep your saved drumkit presets on your device (Art. 6(1)(b) GDPR).
                  You can remove this data anytime by clearing site storage in your browser.
                </p>
                <p>
                  Contact by email:
                  <br />
                  If you contact us by email, your message data is processed only to handle your request
                  (Art. 6(1)(b) or (f) GDPR) and retained only as long as necessary.
                </p>
                <p>
                  You may have rights under GDPR (access, rectification, erasure, restriction, portability, objection,
                  complaint to a supervisory authority). Contact:{" "}
                  {showLegalEmail ? (
                    <span>breakdowndrums@gmail.com</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowLegalEmail(true)}
                      className="underline underline-offset-2 text-neutral-200 hover:text-white"
                    >
                      Click to reveal email
                    </button>
                  )}
                  .
                </p>
              </div>
            )}
          </div>
        </div>
      )}
      {isPreferencesDialogOpen && (
        <div
          className="fixed inset-0 z-[92] bg-black/60 p-4 flex items-center justify-center"
          onMouseDown={() => setIsPreferencesDialogOpen(false)}
        >
          <div
            className="w-full max-w-3xl rounded-xl border border-neutral-700 bg-neutral-900 p-4 md:p-5"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Preferences</h3>
              <button
                type="button"
                onClick={() => setIsPreferencesDialogOpen(false)}
                className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
              >
                Close
              </button>
            </div>
            <div className="mt-4 grid grid-cols-[8.5rem_minmax(0,1fr)] gap-0 rounded border border-neutral-700 overflow-hidden">
              <aside className="bg-neutral-950/40">
                <div className="flex flex-col">
                  {[
                    { id: "timing", label: "Drum Grid" },
                    { id: "notation", label: "Notation" },
                    { id: "editor", label: "Editing" },
                    { id: "library", label: "Library" },
                    { id: "playback", label: "Playback" },
                    { id: "appearance", label: "Appearance" },
                  ].map((cat) => (
                    <button
                      key={`pref-cat-${cat.id}`}
                      type="button"
                      onClick={() => setPreferencesCategory(cat.id)}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        preferencesCategory === cat.id
                          ? "bg-neutral-900 text-white"
                          : "text-neutral-300 hover:bg-neutral-800/50"
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </aside>
              <section className="bg-neutral-900 p-3">
                {preferencesCategory === "playback" ? (
                  <>
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-normal text-neutral-200">Arrangement timing</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <button
                          type="button"
                          onMouseEnter={() => setShowPrefsPlaybackInfo(true)}
                          onMouseLeave={() => setShowPrefsPlaybackInfo(false)}
                          onFocus={() => setShowPrefsPlaybackInfo(true)}
                          onBlur={() => setShowPrefsPlaybackInfo(false)}
                          onClick={() => setShowPrefsPlaybackInfo((v) => !v)}
                          className="h-5 w-5 rounded-full border border-neutral-700 text-[11px] text-neutral-300 hover:bg-neutral-800/60"
                          aria-label="Playback timing info"
                        >
                          i
                        </button>
                        {showPrefsPlaybackInfo && (
                          <div className="absolute left-0 top-6 z-10 w-72 rounded border border-neutral-700 bg-neutral-900 px-2 py-1.5 text-[11px] leading-relaxed text-neutral-300 shadow-lg">
                            Boundary compensation scale: 0 maps to effective -40 ms. Adaptive correction nudges timing live to reduce jitter.
                          </div>
                        )}
                      </div>
                      <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                        <button
                          type="button"
                          onPointerDown={() => startArrangementBoundaryCompRepeat(-1)}
                          onPointerUp={stopArrangementBoundaryCompRepeat}
                          onPointerCancel={stopArrangementBoundaryCompRepeat}
                          onPointerLeave={stopArrangementBoundaryCompRepeat}
                          className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                          aria-label="Decrease boundary compensation"
                        >
                          −
                        </button>
                        <div className="min-w-[72px] px-2 py-1 text-center text-sm text-white border-l border-r border-neutral-700 bg-neutral-800 tabular-nums">
                          {arrangementBoundaryCompScale > 0 ? `+${arrangementBoundaryCompScale}` : arrangementBoundaryCompScale}
                        </div>
                        <button
                          type="button"
                          onPointerDown={() => startArrangementBoundaryCompRepeat(1)}
                          onPointerUp={stopArrangementBoundaryCompRepeat}
                          onPointerCancel={stopArrangementBoundaryCompRepeat}
                          onPointerLeave={stopArrangementBoundaryCompRepeat}
                          className="px-2 text-base leading-none text-neutral-200 hover:bg-neutral-700/60 active:bg-neutral-700"
                          aria-label="Increase boundary compensation"
                        >
                          +
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setArrangementBoundaryCompScale(0)}
                        className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
                      >
                        Reset
                      </button>
                      <label className="inline-flex items-center gap-2 text-xs text-neutral-300 select-none">
                        <input
                          type="checkbox"
                          checked={arrangementAdaptiveCompEnabled}
                          onChange={(e) => setArrangementAdaptiveCompEnabled(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800"
                        />
                        Adaptive correction
                      </label>
                      <div className="text-[11px] text-neutral-500 tabular-nums">
                        Effective: {arrangementBoundaryCompMs > 0 ? `+${arrangementBoundaryCompMs}` : arrangementBoundaryCompMs} ms
                      </div>
                      {arrangementAdaptiveCompEnabled && (
                        <div className="text-[11px] text-neutral-500 tabular-nums">
                          Current correction: {arrangementAdaptiveCurrentCompMs > 0 ? `+${arrangementAdaptiveCurrentCompMs}` : arrangementAdaptiveCurrentCompMs} ms
                        </div>
                      )}
                    </div>
                  </>
                ) : preferencesCategory === "timing" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Resolution</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setKeepTiming((v) => !v)}
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          keepTiming
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="Keep timing when changing resolution or tuplets (remap steps)"
                      >
                        Keep timing
                      </button>
                    </div>
                    <div className="my-3 border-t border-neutral-800" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Playability</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPlayabilityWarningsEnabled((v) => !v)}
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          playabilityWarningsEnabled
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="Warn when more than two hand hits occur at the same time"
                      >
                        Playability warnings
                      </button>
                    </div>
                    <div className="my-3 border-t border-neutral-800" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Sticking Mode</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                        <button
                          type="button"
                          onClick={() => setStickingHandedness((v) => (v === "right" ? "left" : "right"))}
                          className="min-w-[96px] px-3 py-1 text-sm text-neutral-100 hover:bg-neutral-700/60"
                          title="Switch handedness model"
                        >
                          {stickingHandedness === "right" ? "Right-handed" : "Left-handed"}
                        </button>
                      </div>
                      <div className="flex items-stretch overflow-hidden rounded-md border border-neutral-700 bg-neutral-800">
                        <button
                          type="button"
                          onClick={() => setStickingLeadHand((v) => (v === "right" ? "left" : "right"))}
                          className="min-w-[84px] px-3 py-1 text-sm text-neutral-100 hover:bg-neutral-700/60"
                          title="Switch lead hand used for tie-breaks"
                        >
                          Lead: {stickingLeadHand.toUpperCase()}
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => setStickingKeepQuarterLeadHand((v) => !v)}
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          stickingKeepQuarterLeadHand
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="When enabled, quarter-note spacing keeps lead-hand behavior"
                      >
                        Keep quarter lead hand
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowEditedSticking((v) => !v)}
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          showEditedSticking
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="Show manual sticking edits highlighted in yellow"
                      >
                        Show edits
                      </button>
                      <button
                        type="button"
                        onClick={() => setStickingOverrides({})}
                        className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800/60"
                        title="Clear all manual sticking edits"
                      >
                        Clear edits
                      </button>
                    </div>
                  </>
                ) : preferencesCategory === "notation" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Sticking</div>
                    </div>
                    <div className="mt-2 text-xs text-neutral-500">
                      Sticking view is available in the main Notation toolbar.
                    </div>
                  </>
                ) : preferencesCategory === "editor" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Selection Mode</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-2 text-xs text-neutral-300 select-none">
                        <input
                          type="checkbox"
                          checked={legacySelectionEnabled}
                          onChange={(e) => setLegacySelectionEnabled(e.target.checked)}
                          className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800"
                        />
                        Legacy selection
                      </label>
                      <button
                        type="button"
                        onClick={() => setMoveModeDebugEnabled((v) => !v)}
                        className={`px-2 py-1 rounded border text-xs ${
                          moveModeDebugEnabled
                            ? "border-amber-500/70 text-amber-200 bg-amber-500/10"
                            : "border-neutral-700 text-neutral-400 hover:bg-neutral-800/50"
                        }`}
                      >
                        Move mode debug
                      </button>
                    </div>
                    <div className="my-3 border-t border-neutral-800" />
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Move Mode</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setWrapSelectionMoveEnabled((v) => !v)}
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          wrapSelectionMoveEnabled
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="When moving selection with arrows, wrap around at grid edges"
                      >
                        Wrap edges
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMoveOverrideBehavior((prev) =>
                            prev === "permanent" ? "temporary" : "permanent"
                          )
                        }
                        className={`touch-none select-none px-3 py-[5px] rounded border text-sm ${
                          moveOverrideBehavior === "permanent"
                            ? "bg-neutral-800 border-neutral-700 text-white"
                            : "bg-neutral-900 border-neutral-800 text-neutral-600"
                        }`}
                        title="When on: overlaps become permanent changes"
                      >
                        Permanent
                      </button>
                    </div>
                  </>
                ) : preferencesCategory === "appearance" ? (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-normal text-neutral-200">Layout</div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-4">
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
                  </>
                ) : (
                  <>
                    <div className="text-sm text-neutral-200">Coming soon</div>
                    <div className="mt-1 text-xs text-neutral-500">
                      This category will contain additional preferences.
                    </div>
                    <div className="mt-3 border-t border-neutral-800 pt-3 text-xs text-neutral-500">
                      No settings yet.
                    </div>
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}


function SortableKitOrderRow({
  id,
  index,
  label,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`flex items-center gap-1.5 rounded border px-1.5 py-1 ${
        isDragging ? "border-cyan-700/70 bg-cyan-950/20" : "border-neutral-800"
      }`}
    >
      <div className="w-3.5 text-[11px] text-neutral-400">{index + 1}</div>
      <div className="mr-1 text-neutral-500 text-[9px]">⋮⋮</div>
      <div className="flex-1 whitespace-nowrap text-sm leading-tight pr-1">{label}</div>
      <button
        type="button"
        onClick={onRemove}
        className="h-6 px-2 shrink-0 rounded border border-red-900 text-[10px] leading-none text-red-200 hover:bg-red-900/30"
        aria-label="Remove instrument"
        title="Remove instrument"
      >
        ×
      </button>
    </div>
  );
}

function SortableArrangementRow({
  row,
  index,
  isPlaying,
  isSelected,
  onSelect,
  onPlay,
  onRepeatDown,
  onRepeatUp,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.id,
  });
  const verticalTransform = transform ? { ...transform, x: 0 } : null;
  const style = {
    transform: CSS.Transform.toString(verticalTransform),
    transition,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect?.()}
      className={`rounded border px-2.5 py-2 ${
        isPlaying
          ? "border-cyan-500/80 bg-cyan-900/20 shadow-[0_0_0_1px_rgba(6,182,212,0.35)]"
          : isSelected
            ? "border-emerald-500/70 bg-emerald-900/20"
            : isDragging
              ? "border-cyan-700/70 bg-cyan-950/20"
              : "border-neutral-800 bg-neutral-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-white truncate">
            {`${index + 1}. ${row.beat?.name || "(missing beat)"}`}
          </div>
          <div className="text-xs text-neutral-400 truncate">
            {`${row.sectionBars} ${row.sectionBars === 1 ? "bar" : "bars"} (${row.repeats}x ${row.beatBars} ${row.beatBars === 1 ? "bar" : "bars"}) · ${row.beatTimeSig}` +
              (Number.isFinite(row.beatBpm) ? ` · ${row.beatBpm} BPM` : "")}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(e) => e.stopPropagation()}
            className="px-2 py-1 rounded border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-700/60 cursor-grab active:cursor-grabbing"
            title="Drag to reorder"
            aria-label="Drag to reorder"
          >
            ⋮⋮
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPlay?.();
            }}
            disabled={!row.beat?.payload}
            className={`px-2 py-1 rounded border text-xs ${
              row.beat?.payload
                ? "border-neutral-700 text-neutral-100 hover:bg-neutral-700/60"
                : "border-neutral-800 text-neutral-500 cursor-not-allowed"
            }`}
            title="Play section in editor"
          >
            Play
          </button>
          <div className="flex items-stretch overflow-hidden rounded border border-neutral-700 bg-neutral-800">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRepeatDown?.();
              }}
              className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60"
              aria-label="Decrease repeats"
            >
              −
            </button>
            <div className="min-w-[44px] border-l border-r border-neutral-700 px-2 py-1 text-center text-xs text-white">
              x{row.repeats}
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRepeatUp?.();
              }}
              className="px-2 text-xs text-neutral-300 hover:bg-neutral-700/60"
              aria-label="Increase repeats"
            >
              +
            </button>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
            className="px-2 py-1 rounded border border-red-900 text-xs text-red-200 hover:bg-red-900/30"
            aria-label="Remove section"
            title="Remove section"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  );
}


function Grid({
  instruments,
  grid, columns, bars, stepsPerBar, resolution, timeSig, quarterSubdivisionsByBar, normalizedTupletOverridesByBar, barStepOffsets, cycleTupletAt, gridBarsPerLine,
  cycleVelocity, toggleGhost, selection, setSelection, loopRule,
    loopRepeats,
  setLoopRule, wrappedSelectionCells, playhead, moveSelectionByDelta, legacySelectionEnabled, moveModeDebugEnabled, playabilityWarningsEnabled, playabilityWarningStepSet, stickingGuideEnabled, showEditedSticking, stickingAssignmentsByStep, stickingEditModeEnabled, stickingOverrides, onCycleStickingOverride, onDisableStickingEditMode, bakeLoopPreview
}) {
  const notifySelectionFinalized = React.useCallback(() => {
    try {
      window.dispatchEvent(new CustomEvent("dg-selection-finalized"));
    } catch (_) {}
  }, []);
  const longPress = React.useRef({ timer: null, did: false });
  const mouseDragRef = React.useRef({
    phase: "idle", // idle | pending | selecting
    suppressClickUntil: 0,
    startX: 0,
    startY: 0,
    anchorRow: 0,
    anchorCol: 0,
  });
  const skipNextGlobalMouseUpFinalizeRef = React.useRef(false);
  const skipNextWrappedSelectionClearRef = React.useRef(false);
  const suppressNextCellClickToggleRef = React.useRef(false);
  const stepMoveFromPointerDeltaRef = React.useRef(() => false);
  const maybeClearSingleCellSelectionAfterMove = React.useCallback(() => {
    if (press.current.mode !== "move") return;
    const selectedCount =
      Array.isArray(wrappedSelectionCells) && wrappedSelectionCells.length > 0
        ? wrappedSelectionCells.length
        : selection
          ? Math.max(
              1,
              (selection.rowEnd - selection.rowStart + 1) *
                Math.max(1, selection.endExclusive - selection.start)
            )
          : 0;
    if (selectedCount === 1) {
      setLoopRule(null);
      setSelection(null);
    }
  }, [selection, wrappedSelectionCells, setLoopRule, setSelection]);

  // Ensure pending long-press timers don't leak across clicks (desktop).
  useEffect(() => {
    const onGlobalMouseUp = () => {
      if (longPress.current.timer) {
        window.clearTimeout(longPress.current.timer);
        longPress.current.timer = null;
      }
      const wasSelecting = mouseDragRef.current.phase === "selecting";
      mouseDragRef.current.phase = "idle";
      if (skipNextGlobalMouseUpFinalizeRef.current) {
        skipNextGlobalMouseUpFinalizeRef.current = false;
        return;
      }
      // If a selection drag was in progress and the user released outside the grid,
      // we still need to end the drag so clicks work again.
      setDrag((d) => {
        if (d || wasSelecting) {
          // finalize selection gesture
          try { notifySelectionFinalized(); } catch (_) {}
          mouseDragRef.current.suppressClickUntil = Date.now() + 220;
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

  useEffect(() => {
    const onMouseMove = (e) => {
      const md = mouseDragRef.current;
      if (md.phase === "idle") return;
      if ((e.buttons & 1) !== 1) return;

      if (md.phase === "pending") {
        const dx = e.clientX - md.startX;
        const dy = e.clientY - md.startY;
        if (dx * dx + dy * dy < 36) return; // < 6px: treat as click, not selection drag
        if (!legacySelectionEnabled) return;
        md.phase = "selecting";
        setDrag({ row: md.anchorRow, col: md.anchorCol });
      }
      if (md.phase !== "selecting") return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-gridcell='1']");
      if (!cell) {
        return;
      }
      const r1 = Number(cell.getAttribute("data-row"));
      const c1 = Number(cell.getAttribute("data-col"));
      if (Number.isNaN(r1) || Number.isNaN(c1)) return;
      setSelection({
        rowStart: Math.min(md.anchorRow, r1),
        rowEnd: Math.max(md.anchorRow, r1),
        start: Math.min(md.anchorCol, c1),
        endExclusive: Math.max(md.anchorCol, c1) + 1,
      });
    };

    const onMouseUp = () => {
      const md = mouseDragRef.current;
      if (md.phase !== "selecting") {
        md.phase = "idle";
        return;
      }
      md.phase = "idle";
      md.suppressClickUntil = Date.now() + 220;
      skipNextGlobalMouseUpFinalizeRef.current = true;
      notifySelectionFinalized();
      setDrag(null);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [notifySelectionFinalized, legacySelectionEnabled, moveModeDebugEnabled]);

  // Desktop long-press interactions: ghost / move / selection.
  useEffect(() => {
    const onMove = (e) => {
      if (!press.current.active) return;
      if (press.current.pointerId !== "mouse") return;

      // Only react while the mouse button is still held down.
      if ((e.buttons & 1) !== 1) return;

      // Require a small movement threshold to avoid accidental selection from small cursor drift.
      // For move interactions, use a very small threshold so dragging a selected region feels immediate.
      const dx = e.clientX - press.current.startX;
      const dy = e.clientY - press.current.startY;
      const isMoveInteraction =
        press.current.mode === "moveArmed" || press.current.mode === "move";
      const thresholdSq = isMoveInteraction ? 1 : 36; // ~1px for move, 6px otherwise
      if (dx * dx + dy * dy < thresholdSq) return;

      const el = document.elementFromPoint(e.clientX, e.clientY);
      const cell = el?.closest?.("[data-gridcell='1']");
      if (!cell) return;

      const r1 = Number(cell.getAttribute("data-row"));
      const c1 = Number(cell.getAttribute("data-col"));
      if (Number.isNaN(r1) || Number.isNaN(c1)) return;

      const r0 = press.current.startRow;
      const c0 = press.current.startCol;
      const isMoveComparison =
        press.current.mode === "moveArmed" || press.current.mode === "move";
      const refRow = isMoveComparison ? press.current.moveLastRow : r0;
      const refCol = isMoveComparison ? press.current.moveLastCol : c0;
      if (r1 === refRow && c1 === refCol) return;

      if (press.current.mode === "ghostArmed") {
        if (longPress.current.timer) {
          window.clearTimeout(longPress.current.timer);
          longPress.current.timer = null;
        }
        longPress.current.did = false;
        if (press.current.startWasSelected || press.current.startVal !== CELL.OFF) {
          if (legacySelectionEnabled) {
            if (!press.current.startWasSelected) {
              setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
            }
            press.current.mode = "selectArmed";
          } else {
            if (!press.current.startWasSelected) {
              setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
            }
            press.current.mode = "move";
            if (moveModeDebugEnabled) setShowMoveDebugCue(true);
            press.current.moveLastRow = r0;
            press.current.moveLastCol = c0;
            const movedNow = stepMoveFromPointerDeltaRef.current?.(r1, c1);
            if (!movedNow) {
              window.requestAnimationFrame(() => {
                if (!press.current.active || press.current.pointerId !== "mouse") return;
                if (press.current.mode !== "move") return;
                stepMoveFromPointerDeltaRef.current?.(r1, c1);
              });
            }
          }
        } else {
          press.current.mode = "selectArmed";
        }
      } else if (press.current.mode === "ghostDone") {
        if (press.current.ghostToggled && press.current.instId) {
          try { toggleGhost(press.current.instId, c0, press.current.startVal); } catch (_) {}
        }
        if (legacySelectionEnabled || !press.current.startWasSelected) {
          press.current.mode = "select";
          mouseDragRef.current.phase = "selecting";
          mouseDragRef.current.anchorRow = r0;
          mouseDragRef.current.anchorCol = c0;
          mouseDragRef.current.startX = press.current.startX;
          mouseDragRef.current.startY = press.current.startY;
          setDrag({ row: r0, col: c0 });
          setSelection({
            rowStart: Math.min(r0, r1),
            rowEnd: Math.max(r0, r1),
            start: Math.min(c0, c1),
            endExclusive: Math.max(c0, c1) + 1,
          });
        } else {
          if (!press.current.startWasSelected) {
            setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
          }
          press.current.mode = "move";
          if (moveModeDebugEnabled) setShowMoveDebugCue(true);
          press.current.moveLastRow = r0;
          press.current.moveLastCol = c0;
          stepMoveFromPointerDeltaRef.current?.(r1, c1);
        }
      } else if (press.current.mode === "moveArmed" || press.current.mode === "move") {
        // Modern mode: distinguish quick drag (move) vs long-press drag (selection for looping)
        // for single-cell starts. Existing multi-cell selection dragging still uses move mode.
        const heldMs = Date.now() - (press.current.startTime || 0);
        const shouldLongPressSelect =
          !legacySelectionEnabled &&
          press.current.mode === "moveArmed" &&
          !press.current.startWasSelected &&
          heldMs >= 130;
        if (shouldLongPressSelect) {
          press.current.mode = "select";
          mouseDragRef.current.phase = "selecting";
          mouseDragRef.current.anchorRow = r0;
          mouseDragRef.current.anchorCol = c0;
          mouseDragRef.current.startX = press.current.startX;
          mouseDragRef.current.startY = press.current.startY;
          setDrag({ row: r0, col: c0 });
          setSelection({
            rowStart: Math.min(r0, r1),
            rowEnd: Math.max(r0, r1),
            start: Math.min(c0, c1),
            endExclusive: Math.max(c0, c1) + 1,
          });
          return;
        }
        if (press.current.mode === "moveArmed") {
          if (!press.current.startWasSelected) {
            setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
          }
          press.current.mode = "move";
          if (moveModeDebugEnabled) setShowMoveDebugCue(true);
        }
        const movedNow = stepMoveFromPointerDeltaRef.current?.(r1, c1);
        if (!movedNow) {
          window.requestAnimationFrame(() => {
            if (!press.current.active || press.current.pointerId !== "mouse") return;
            if (press.current.mode !== "move") return;
            stepMoveFromPointerDeltaRef.current?.(r1, c1);
          });
        }
      } else if (press.current.mode === "selectArmed") {
        if (legacySelectionEnabled) {
          press.current.mode = "select";
          mouseDragRef.current.phase = "selecting";
          mouseDragRef.current.anchorRow = r0;
          mouseDragRef.current.anchorCol = c0;
          mouseDragRef.current.startX = press.current.startX;
          mouseDragRef.current.startY = press.current.startY;
          setDrag({ row: r0, col: c0 });
          setSelection({
            rowStart: Math.min(r0, r1),
            rowEnd: Math.max(r0, r1),
            start: Math.min(c0, c1),
            endExclusive: Math.max(c0, c1) + 1,
          });
        }
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
      maybeClearSingleCellSelectionAfterMove();

      press.current.active = false;
      press.current.pointerId = null;
      press.current.mode = "none";
                        press.current.ghostToggled = false;
                        press.current.didSelect = false;
      press.current.didSelect = false;
      press.current.instId = null;
      press.current.ghostToggled = false;
      press.current.didSelect = false;
      press.current.startX = 0;
      press.current.startY = 0;
      press.current.startTime = 0;
      setShowMoveDebugCue(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [notifySelectionFinalized, legacySelectionEnabled, maybeClearSingleCellSelectionAfterMove]);
  const press = React.useRef({
    active: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    mode: "none", // none | ghostArmed | ghostDone | selectArmed | select | moveArmed | move
    startRow: 0,
    startCol: 0,
    moveLastRow: 0,
    moveLastCol: 0,
    startVal: CELL.OFF,
    startWasSelected: false,
    instId: null,
    ghostToggled: false,
    didSelect: false,
  });
  const [showMoveDebugCue, setShowMoveDebugCue] = useState(false);
  const [drag, setDrag] = useState(null); // { row, col }
  const stepMetaByBar = React.useMemo(
    () => quarterSubdivisionsByBar.map((subs) => buildStepMeta(subs)),
    [quarterSubdivisionsByBar]
  );

  const labelFor = (stepMeta) => {
    const beat = stepMeta.quarterIndex + 1;
    const sub = stepMeta.subIndex;
    const subdiv = Math.max(1, stepMeta.subdiv || 1);
    if (subdiv === 1) return `${beat}`;
    if (subdiv === 2) return sub === 0 ? `${beat}` : "&";
    if (subdiv === 3) return [String(beat), "tri", "let"][sub] || "·";
    if (subdiv === 4) return [String(beat), "e", "&", "a"][sub] || "·";
    return sub === 0 ? `${beat}` : "·";
  };

  const getQuarterBandClass = React.useCallback(
    (barIdx, stepMeta) => {
      if (!stepMeta) return "";
      const quarterIdx = stepMeta.quarterIndex ?? 0;
      const tuplet = normalizedTupletOverridesByBar?.[barIdx]?.[quarterIdx] ?? null;
      if (tuplet != null) return TUPLET_COLOR_CLASS[tuplet] || "bg-amber-900/25";
      return "";
    },
    [normalizedTupletOverridesByBar]
  );



  
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
      const r = instruments.findIndex((x) => x.id === instId);
      if (wrappedSelectionCells && wrappedSelectionCells.length >= 2) {
        return wrappedSelectionCells.some((cell) => cell.row === r && cell.col === stepIndex)
          ? "selected"
          : "none";
      }
      const width = selection.endExclusive - selection.start;
      if (width >= 2) {
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
  const isCellInSelection = React.useCallback(
    (row, col) => {
      if (!Number.isFinite(row) || !Number.isFinite(col)) return false;
      if (wrappedSelectionCells && wrappedSelectionCells.length > 0) {
        return wrappedSelectionCells.some((cell) => cell.row === row && cell.col === col);
      }
      if (!selection) return false;
      return (
        row >= selection.rowStart &&
        row <= selection.rowEnd &&
        col >= selection.start &&
        col < selection.endExclusive
      );
    },
    [selection, wrappedSelectionCells]
  );
  const stepMoveFromPointerDelta = React.useCallback(
    (toRow, toCol) => {
      if (!moveSelectionByDelta) return;
      const fromRow = press.current.moveLastRow;
      const fromCol = press.current.moveLastCol;
      let dRow = toRow - fromRow;
      let dCol = toCol - fromCol;
      let movedAny = false;
      while (dRow !== 0) {
        const step = dRow > 0 ? 1 : -1;
        const moved = moveSelectionByDelta(step, 0);
        if (moved) movedAny = true;
        dRow -= step;
      }
      while (dCol !== 0) {
        const step = dCol > 0 ? 1 : -1;
        const moved = moveSelectionByDelta(0, step);
        if (moved) movedAny = true;
        dCol -= step;
      }
      if (movedAny) {
        press.current.moveLastRow = toRow;
        press.current.moveLastCol = toCol;
      }
      return movedAny;
    },
    [moveSelectionByDelta]
  );
  stepMoveFromPointerDeltaRef.current = stepMoveFromPointerDelta;



  return (
    <div
      className={`relative flex flex-col gap-6 ${showMoveDebugCue ? "outline outline-2 outline-amber-500/80 rounded-sm" : ""}`}
      data-gridsurface="1"
    >
      {Array.from({ length: Math.ceil(bars / Math.max(1, Math.min(bars, Number(gridBarsPerLine) || 1))) }).map((_, lineIdx) => {
        const perLine = Math.max(1, Math.min(bars, Number(gridBarsPerLine) || 1));
        const barStart = lineIdx * perLine;
        const barEnd = Math.min(bars, (lineIdx + 1) * perLine);
        const stepsInLine = (barEnd - barStart) * stepsPerBar;

        // Build timeline for this line (with visual bar gaps)
        const timeline = [];
        for (let b = barStart; b < barEnd; b++) {
          const meta = stepMetaByBar[b] || [];
          const barOffset = barStepOffsets[b] ?? 0;
          for (let s = 0; s < meta.length; s++) {
            timeline.push({
              bar: b,
              stepInBar: s,
              stepMeta: meta[s],
              stepIndex: barOffset + s,
              type: "cell",
            });
          }
          if (b !== barEnd - 1) timeline.push({ type: "gap", key: `gap-${b}` });
        }

        return (
          <div key={`gridline-${lineIdx}`} className="grid gap-1" style={{ gridTemplateColumns: `auto repeat(${timeline.length}, 28px)` }}>
            <div />
            {timeline.map((t, i) => {
              if (t.type === "gap") return <div key={t.key} />;
              const label = labelFor(t.stepMeta || { quarterIndex: 0, subIndex: 0, subdiv: 1 });
              return (
                <div
                  key={`h-${t.stepIndex}`}
                  className={`relative h-6 text-xs text-center text-neutral-400 select-none overflow-visible cursor-pointer hover:text-neutral-200 rounded-sm ${getQuarterBandClass(t.bar, t.stepMeta)}`}
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    const quarterIdx = t.stepMeta?.quarterIndex ?? 0;
                    const label = labelFor(t.stepMeta || { quarterIndex: 0, subIndex: 0, subdiv: 1 });
                    const isBeatNumber = /^\d+$/.test(label);
                    const currentTuplet = normalizedTupletOverridesByBar?.[t.bar]?.[quarterIdx] ?? null;
                    const dir = isBeatNumber ? (currentTuplet == null ? 1 : -1) : 1;
                    cycleTupletAt?.(t.bar, quarterIdx, dir);
                  }}
                  title={`Click to cycle tuplet for bar ${t.bar + 1}, beat ${(t.stepMeta?.quarterIndex ?? 0) + 1}`}
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
                <div
                  className="pr-2 text-xs text-right whitespace-nowrap select-none cursor-pointer hover:text-neutral-200"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    if (e.button !== 0) return;
                    const r = instruments.findIndex((x) => x.id === inst.id);
                    if (r < 0) return;
                    setSelection({
                      rowStart: r,
                      rowEnd: r,
                      start: 0,
                      endExclusive: columns,
                    });
                    notifySelectionFinalized();
                  }}
                  title="Select full row"
                >
                  {inst.label}
                </div>
                {timeline.map((t, i) => {
                  if (t.type === "gap") return <div key={`g-${inst.id}-${lineIdx}-${i}`} />;
                  const val = grid[inst.id]?.[t.stepIndex] ?? CELL.OFF;
                  const quarterBandClass = getQuarterBandClass(t.bar, t.stepMeta);
                  const isUnplayableStep = !!playabilityWarningStepSet?.has(t.stepIndex);
                  const hasPlayabilityWarning =
                    !!playabilityWarningsEnabled && isUnplayableStep;
                  const stickingOverrideKey = `${inst.id}:${t.stepIndex}`;
                  const hasManualStickingOverride =
                    !FOOT_INSTRUMENTS.has(inst.id) &&
                    (stickingOverrides?.[stickingOverrideKey] === "L" ||
                      stickingOverrides?.[stickingOverrideKey] === "R");
                  const stickingHand =
                    stickingGuideEnabled &&
                    !isUnplayableStep &&
                    !FOOT_INSTRUMENTS.has(inst.id) &&
                    val !== CELL.OFF
                      ? stickingAssignmentsByStep?.[t.stepIndex]?.[inst.id] || ""
                      : "";
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
                                try { toggleGhost(press.current.instId, c0, press.current.startVal); } catch (_) {}
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
                        // If loop preview is active and user starts on the current selection,
                        // exit looping so long-press / drag can enter move interaction.
                        if (loopRule) {
                          if (!legacySelectionEnabled) {
                            if (isCellInSelection(r, c)) {
                              // Keep loop active on simple press/click.
                              // Move mode will take over only after actual drag movement.
                            } else {
                              suppressNextCellClickToggleRef.current = true;
                              bakeLoopPreview?.();
                              return;
                            }
                          } else if (isCellInSelection(r, c)) {
                            setLoopRule(null);
                            skipNextWrappedSelectionClearRef.current = true;
                          } else {
                            // In legacy mode, clicking outside source should bake the loop.
                            bakeLoopPreview?.();
                            return;
                          }
                        }

                        press.current.active = true;
                        press.current.pointerId = e.pointerId;
                        press.current.startX = e.clientX;
                        press.current.startY = e.clientY;
                        press.current.mode = "none";
                        press.current.ghostToggled = false;
                        press.current.didSelect = false;
                        longPress.current.did = false;
                        press.current.startRow = r;
                        press.current.startCol = c;
                        press.current.moveLastRow = r;
                        press.current.moveLastCol = c;
                        press.current.startVal = val;
                        press.current.startWasSelected = isCellInSelection(r, c);
                        press.current.instId = inst.id;

                        // Movement takes priority when starting from current selection.
                        if (press.current.startWasSelected) {
                          press.current.mode = legacySelectionEnabled ? "selectArmed" : "moveArmed";
                        } else if (val !== CELL.OFF && GHOST_ENABLED.has(inst.id)) {
                          // Ghost long-press on active cells (ghost-enabled instruments)
                          press.current.mode = "ghostArmed";
                        } else if (val !== CELL.OFF) {
                          // Single active cell can be moved with long-press + drag (modern mode).
                          // Legacy mode keeps selection-first behavior.
                          press.current.mode = legacySelectionEnabled ? "selectArmed" : "moveArmed";
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
                          if (press.current.mode === "moveArmed") {
                            // Enter move mode only when pointer actually moves.
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
                        // switch into move/selection mode and revert the ghost toggle when needed.
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
                              if (press.current.startWasSelected || press.current.startVal !== CELL.OFF) {
                                if (!press.current.startWasSelected) {
                                  setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
                                }
                                press.current.mode = "move";
                                if (moveModeDebugEnabled) setShowMoveDebugCue(true);
                                press.current.moveLastRow = r0;
                                press.current.moveLastCol = c0;
                                stepMoveFromPointerDelta(r1, c1);
                              } else {
                                press.current.mode = "select";
                                setDrag({ row: r0, col: c0 });
                                press.current.didSelect = true;
                                setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
                              }
                            } else if (press.current.mode === "ghostDone") {
                              longPress.current.did = false;
                              if (press.current.ghostToggled && press.current.instId) {
                                try { toggleGhost(press.current.instId, c0, press.current.startVal); } catch (_) {}
                              }
                              if (legacySelectionEnabled || !press.current.startWasSelected) {
                                press.current.mode = "select";
                                setDrag({ row: r0, col: c0 });
                                press.current.didSelect = true;
                                setSelection({
                                  rowStart: Math.min(r0, r1),
                                  rowEnd: Math.max(r0, r1),
                                  start: Math.min(c0, c1),
                                  endExclusive: Math.max(c0, c1) + 1,
                                });
                              } else {
                                if (!press.current.startWasSelected) {
                                  setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
                                }
                                press.current.mode = "move";
                                if (moveModeDebugEnabled) setShowMoveDebugCue(true);
                                press.current.moveLastRow = r0;
                                press.current.moveLastCol = c0;
                                stepMoveFromPointerDelta(r1, c1);
                              }
                            } else if (press.current.mode === "moveArmed") {
                              if (!press.current.startWasSelected) {
                                setSelection({ rowStart: r0, rowEnd: r0, start: c0, endExclusive: c0 + 1 });
                              }
                              press.current.mode = "move";
                              if (moveModeDebugEnabled) setShowMoveDebugCue(true);
                              press.current.moveLastRow = r0;
                              press.current.moveLastCol = c0;
                              stepMoveFromPointerDelta(r1, c1);
                            } else if (press.current.mode === "move") {
                              stepMoveFromPointerDelta(r1, c1);
                            } else if (press.current.mode === "select") {
                              setSelection({ rowStart: Math.min(r0, r1), rowEnd: Math.max(r0, r1), start: Math.min(c0, c1), endExclusive: Math.max(c0, c1) + 1 });
                            }
                          }
                        }

                        // Only drag after selection mode has begun (after long-press).
                        if (press.current.mode !== "select" && press.current.mode !== "move") return;

                        const el = document.elementFromPoint(e.clientX, e.clientY);
                        const cell = el?.closest?.("[data-gridcell='1']");
                        if (!cell) return;
                        const r1 = Number(cell.getAttribute("data-row"));
                        const c1 = Number(cell.getAttribute("data-col"));
                        if (Number.isNaN(r1) || Number.isNaN(c1)) return;

                        const r0 = press.current.startRow;
                        const c0 = press.current.startCol;

                        if (press.current.mode === "move") {
                          stepMoveFromPointerDelta(r1, c1);
                        } else {
                          const rowStart = Math.min(r0, r1);
                          const rowEnd = Math.max(r0, r1);
                          const start = Math.min(c0, c1);
                          const endExclusive = Math.max(c0, c1) + 1;
                          setSelection({ rowStart, rowEnd, start, endExclusive });
                        }
                      }}
                      onPointerUp={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;

                        maybeClearSingleCellSelectionAfterMove();
                        press.current.active = false;
                        press.current.pointerId = null;
                        setShowMoveDebugCue(false);
                        setDrag(null);
                        notifySelectionFinalized();
                      }}
                      onPointerCancel={(e) => {
                        if (e.pointerType === "mouse") return;
                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.timer = null;

                        maybeClearSingleCellSelectionAfterMove();
                        press.current.active = false;
                        press.current.pointerId = null;
                        setShowMoveDebugCue(false);
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
                        if (suppressNextCellClickToggleRef.current) {
                          suppressNextCellClickToggleRef.current = false;
                          return;
                        }
                        if (Date.now() < (mouseDragRef.current.suppressClickUntil || 0)) {
                          return;
                        }
                        const clickRow = instruments.findIndex((x) => x.id === inst.id);
                        const clickCol = t.stepIndex;
                        const clickedInSelection = isCellInSelection(clickRow, clickCol);
                        if (!legacySelectionEnabled && selection) {
                          if (skipNextWrappedSelectionClearRef.current) {
                            skipNextWrappedSelectionClearRef.current = false;
                            if (clickedInSelection) return;
                          }
                          if (!clickedInSelection) {
                            setLoopRule(null);
                            setSelection(null);
                            return;
                          }
                          if (!loopRule && !(stickingEditModeEnabled && clickedInSelection)) return;
                        }
                        if (wrappedSelectionCells && wrappedSelectionCells.length > 0) {
                          setLoopRule(null);
                          setSelection(null);
                          return;
                        }
                        if (
                          stickingEditModeEnabled &&
                          !FOOT_INSTRUMENTS.has(inst.id) &&
                          val !== CELL.OFF
                        ) {
                          onCycleStickingOverride?.(inst.id, t.stepIndex);
                          return;
                        }
                        if (stickingEditModeEnabled) {
                          onDisableStickingEditMode?.();
                        }
                        cycleVelocity(inst.id, t.stepIndex);
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        const r = instruments.findIndex((x) => x.id === inst.id);
                        const c = t.stepIndex;
                        if (loopRule) {
                          if (!legacySelectionEnabled) {
                            if (isCellInSelection(r, c)) {
                              // Keep loop active on simple press/click.
                              // Move mode will take over only after actual drag movement.
                            } else {
                              suppressNextCellClickToggleRef.current = true;
                              bakeLoopPreview?.();
                              return;
                            }
                          } else if (isCellInSelection(r, c)) {
                            setLoopRule(null);
                            skipNextWrappedSelectionClearRef.current = true;
                          } else {
                            // In legacy mode, clicking outside source should bake the loop.
                            suppressNextCellClickToggleRef.current = true;
                            bakeLoopPreview?.();
                            return;
                          }
                        }
                        // Guard against stale ghost press state leaking into a new interaction.
                        if (press.current.pointerId === "mouse" && press.current.mode === "ghostDone") {
                          if (longPress.current.timer) {
                            window.clearTimeout(longPress.current.timer);
                            longPress.current.timer = null;
                          }
                          press.current.active = false;
                          press.current.pointerId = null;
                          press.current.mode = "none";
                          press.current.ghostToggled = false;
                          press.current.didSelect = false;
                          longPress.current.did = false;
                        }

                        const val = grid[inst.id][c];
                        const ghostAllowed = GHOST_ENABLED.has(inst.id);
                        press.current.active = true;
                        press.current.pointerId = "mouse";
                        press.current.startRow = r;
                        press.current.startCol = c;
                        press.current.moveLastRow = r;
                        press.current.moveLastCol = c;
                        press.current.startVal = val;
                        press.current.startWasSelected = isCellInSelection(r, c);
                        press.current.startX = e.clientX;
                        press.current.startY = e.clientY;
                        press.current.startTime = Date.now();
                        press.current.instId = inst.id;
                        press.current.ghostToggled = false;
                        press.current.didSelect = false;
                        longPress.current.did = false;

                        // Mode priority:
                        // 1) moving existing selection
                        // 2) ghost toggle on active ghost-capable cell
                        // 3) move single active cell
                        // 4) selection (legacy immediate-drag or long-press-drag)
                        if (press.current.startWasSelected) {
                          press.current.mode = legacySelectionEnabled ? "selectArmed" : "moveArmed";
                        } else if (ghostAllowed && (val === CELL.ON || val === CELL.GHOST || val === CELL.ACCENT)) {
                          press.current.mode = "ghostArmed";
                        } else if (val !== CELL.OFF) {
                          press.current.mode = legacySelectionEnabled ? "selectArmed" : "moveArmed";
                        } else {
                          press.current.mode = "selectArmed";
                        }

                        if (legacySelectionEnabled && press.current.mode === "selectArmed") {
                          mouseDragRef.current.phase = "pending";
                          mouseDragRef.current.startX = e.clientX;
                          mouseDragRef.current.startY = e.clientY;
                          mouseDragRef.current.anchorRow = r;
                          mouseDragRef.current.anchorCol = c;
                        }

                        if (longPress.current.timer) window.clearTimeout(longPress.current.timer);
                        longPress.current.did = false;
                        longPress.current.timer = window.setTimeout(() => {
                          if (!press.current.active || press.current.pointerId !== "mouse") return;
                          if (press.current.mode === "ghostArmed") {
                            longPress.current.did = true;
                            toggleGhost(inst.id, c);
                            press.current.mode = "ghostDone";
                            press.current.ghostToggled = true;
                            return;
                          }
                          if (press.current.mode === "moveArmed") {
                            // Enter move mode only when pointer actually moves.
                            return;
                          }
                          if (press.current.mode === "selectArmed") {
                            longPress.current.did = true;
                            press.current.mode = "select";
                            setDrag({ row: r, col: c });
                            setSelection({ rowStart: r, rowEnd: r, start: c, endExclusive: c + 1 });
                            return;
                          }
                        }, 130);
                      }}
                      className={`w-7 h-7 border cursor-pointer ${CELL_COLOR[val]} ${val === CELL.ACCENT ? "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.98)]" : ""} ${(() => {
                        const role = getCellRole(inst.id, t.stepIndex);
                        if (role === "source") return "border-cyan-300 ring-2 ring-cyan-300/40";
                        if (role === "generated") return "border-neutral-600 opacity-70";
                        if (role === "selected") return "border-cyan-300 ring-2 ring-cyan-300/30";
                        return "border-neutral-800";
                      })()} ${hasPlayabilityWarning ? "shadow-[inset_0_0_0_1px_rgba(239,68,68,0.35)]" : ""} relative overflow-hidden`}
                    >
                      <span
                        className={`pointer-events-none absolute inset-0 ${quarterBandClass} ${
                          quarterBandClass ? "opacity-100" : (val === CELL.OFF ? "opacity-100" : "opacity-40")
                        }`}
                        aria-hidden="true"
                      />
                      {stickingHand && (
                        <span
                          className={`pointer-events-none absolute bottom-[1px] right-[2px] text-[9px] leading-none font-semibold ${
                            showEditedSticking && hasManualStickingOverride ? "text-amber-300" : "text-neutral-100/90"
                          }`}
                          aria-hidden="true"
                        >
                          {stickingHand}
                        </span>
                      )}
                    </div>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
        );
      })}
      {showMoveDebugCue && (
        <div className="text-[10px] uppercase tracking-wide text-amber-300">Move mode (debug)</div>
      )}
    </div>
  );
}

function Notation({
  instruments,
  grid,
  stickingAssignmentsByStep,
  showNotationSticking,
  notationStickingView,
  resolution,
  bars,
  barsPerLine,
  stepsPerBar,
  timeSig,
  quarterSubdivisionsByBar,
  barStepOffsets,
  mergeRests,
  mergeNotes,
  dottedNotes,
  flatBeams,
  justifySystems = false,
  targetContentWidth = null,
  activeBarIndices = [],
  sectionMarkers = [],
  tempoMarkers = [],
  showSystemBarNumbers = false,
  barNumberOffset = 0,
}) {
  const VF = Vex.Flow;
  const ref = useRef(null);

  useEffect(() => {
  const Flow = Vex.Flow;
    const activeBarSet = new Set(
      (Array.isArray(activeBarIndices) ? activeBarIndices : [])
        .map((v) => Number(v))
        .filter((v) => Number.isFinite(v) && v >= 0)
    );
    const sectionMarkerMap = new Map(
      (Array.isArray(sectionMarkers) ? sectionMarkers : [])
        .map((m) => [Number(m?.bar), String(m?.text || "").trim()])
        .filter(([bar, text]) => Number.isFinite(bar) && bar >= 0 && text)
    );
    const tempoMarkerMap = new Map(
      (Array.isArray(tempoMarkers) ? tempoMarkers : [])
        .map((m) => [Number(m?.bar), String(m?.text || "").trim()])
        .filter(([bar, text]) => Number.isFinite(bar) && bar >= 0 && text)
    );
    const drawArrangementTextMarkers = (staves, perLine) => {
      if (!Array.isArray(staves) || staves.length < 1) return;
      ctx.save();
      for (let b = 0; b < staves.length; b++) {
        const stave = staves[b];
        const x = Number(stave?.getX?.()) || 0;
        const yTop = Number(stave?.getYForLine?.(0)) || 0;
        if (showSystemBarNumbers && b % Math.max(1, Number(perLine) || 1) === 0) {
          const barNo = Math.max(1, Number(barNumberOffset) + b + 1);
          ctx.setFont("Arial", 11, "normal");
          ctx.fillStyle = "#d4d4d4";
          ctx.fillText(String(barNo), x + 2, yTop - 44);
        }
        const sectionText = sectionMarkerMap.get(b);
        if (sectionText) {
          ctx.setFont("Arial", 11, "bold");
          ctx.fillStyle = "#e5e5e5";
          ctx.fillText(sectionText, x + 18, yTop - 44);
        }
        const tempoText = tempoMarkerMap.get(b);
        if (tempoText) {
          ctx.fillStyle = "#d4d4d4";
          const tx = x + 18;
          const ty = yTop - 30;
          const m = /^♩\s*=\s*(.+)$/.exec(tempoText);
          if (m) {
            ctx.setFont("Arial", 14, "normal");
            ctx.fillText("♩", tx, ty);
            const noteWidth = ctx.measureText("♩").width || 8;
            ctx.setFont("Arial", 10, "normal");
            ctx.fillText(` = ${m[1]}`, tx + noteWidth + 1, ty);
          } else {
            ctx.setFont("Arial", 10, "normal");
            ctx.fillText(tempoText, tx, ty);
          }
        }
      }
      ctx.restore();
    };
    const paintActiveBarHighlights = (svg, staves) => {
      if (!svg || !Array.isArray(staves) || !activeBarSet.size) return;
      staves.forEach((stave, barIndex) => {
        if (!activeBarSet.has(barIndex)) return;
        const x = Number(stave?.getX?.()) || 0;
        const width = Number(stave?.getWidth?.()) || 0;
        const yTop = Number(stave?.getYForLine?.(0)) || 0;
        const yBottom = Number(stave?.getYForLine?.(4)) || 0;
        const y = yTop - 22;
        const height = Math.max(40, (yBottom - yTop) + 44);
        const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        rect.setAttribute("x", String(x + 1));
        rect.setAttribute("y", String(y));
        rect.setAttribute("width", String(Math.max(0, width - 2)));
        rect.setAttribute("height", String(height));
        rect.setAttribute("rx", "6");
        rect.setAttribute("ry", "6");
        rect.setAttribute("fill", "rgba(34,211,238,0.08)");
        rect.setAttribute("stroke", "rgba(34,211,238,0.7)");
        rect.setAttribute("stroke-width", "1.5");
        rect.setAttribute("class", "dg-active-bar");
        svg.insertBefore(rect, svg.firstChild);
      });
    };

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
      note.__dgHasGhost = true;

      // Use custom small SMuFL glyphs via keyProps so the override survives notehead rebuilds.
      try {
        const keyProps = (typeof note.getKeyProps === "function" && note.getKeyProps()) || [];
        let changed = false;
        ghostKeyIndices.forEach((i) => {
          const kp = keyProps?.[i];
          if (!kp) return;
          const code = String(kp.code || "");
          let target = CUSTOM_GHOST_GLYPHS.black;
          if (code.includes("CircleX")) target = CUSTOM_GHOST_GLYPHS.circleX;
          else if (code.includes("X")) target = CUSTOM_GHOST_GLYPHS.x;
          if (kp.code !== target) {
            kp.code = target;
            changed = true;
          }
        });
        if (changed && typeof note.reset === "function") note.reset();
      } catch (_) {}
    };
    const applyGhostStemOverride = (note, ghostKeyIndices) => {
      if (!note || !ghostKeyIndices || ghostKeyIndices.length === 0) return;
      try {
        // Stabilize ghost stem geometry when custom notehead metrics differ.
        // Value is in px and intentionally close to VexFlow default stem size.
        if (typeof note.setStemLength === "function") note.setStemLength(35);
      } catch (_) {}
    };
    const applyAccentArticulation = (note, accentKeyIndices) => {
      if (!note || !accentKeyIndices || accentKeyIndices.length === 0) return;
      try {
        const art = new Flow.Articulation("a>");
        art.setPosition(Flow.Modifier.Position.ABOVE);
        if (art?.render_options && Number.isFinite(art.render_options.font_scale)) {
          art.render_options.font_scale = art.render_options.font_scale * 0.88;
          if (typeof art.reset === "function") art.reset();
        }
        if (typeof art.setXShift === "function") art.setXShift(2);
        note.addModifier(art, 0);
      } catch (_) {}
    };
    const getStickingSpecForStep = (stepIdx) => {
      if (!showNotationSticking) return [];
      const map = stickingAssignmentsByStep?.[stepIdx];
      if (!map || typeof map !== "object") return [];
      const hands = Object.values(map).filter((h) => h === "L" || h === "R");
      if (!hands.length) return [];
      const hasR = hands.includes("R");
      const hasL = hands.includes("L");
      const splitTop = { text: "R", lane: "top" };
      const splitBottom = { text: "L", lane: "bottom" };
      if (notationStickingView === "split-rows") {
        const out = [];
        if (hasR) out.push(splitTop);
        if (hasL) out.push(splitBottom);
        return out;
      }
      // "stacked" view: only stack when both hands are present at this step.
      if (hasR && hasL) return [{ text: "R", lane: "top" }, { text: "L", lane: "bottom" }];
      if (hasR) return [{ text: "R", lane: "top" }];
      return [{ text: "L", lane: "top" }];
    };
    const applyStickingAnnotation = (note, specList, stepIdx = -1) => {
      if (!note || !Array.isArray(specList) || specList.length < 1) return;
      // Draw after voice rendering; this avoids Annotation layout quirks.
      note.__dgStickingSpec = specList;
      note.__dgStickingStep = stepIdx;
    };
    const drawStickingSpecsForVoice = (voice) => {
      const tickables = (voice && typeof voice.getTickables === "function" && voice.getTickables()) || [];
      tickables.forEach((note) => {
        const specList = note?.__dgStickingSpec;
        if (!Array.isArray(specList) || specList.length < 1) return;
        const stave = note.getStave?.();
        const absX = Number(note.getAbsoluteX?.()) || 0;
        const headBegin = Number(note.getNoteHeadBeginX?.());
        const headEnd = Number(note.getNoteHeadEndX?.());
        const x =
          Number.isFinite(headBegin) && Number.isFinite(headEnd) && headEnd > headBegin
            ? (headBegin + headEnd) / 2
            : absX;
        // Keep two fixed rows, visually aligned closer to noteheads.
        const yTop = (stave?.getYForBottomText?.(1) ?? 143) - 3;
        const yBottom = stave?.getYForBottomText?.(2) ?? 156;
        specList.forEach((spec) => {
          const txt = String(spec?.text || "");
          if (!txt) return;
          const lane = String(spec?.lane || "stackSingle");
          const y = (lane === "bottom" ? yBottom : yTop) + 8;
          ctx.save();
          ctx.setFont("Arial", 10, "normal");
          const w = ctx.measureText(txt)?.width || 0;
          const xNudge = txt === "L" && lane === "bottom" ? -1.00 : 0;
          ctx.fillText(txt, x - w / 2 + xNudge, y);
          ctx.restore();
        });
      });
    };

    const applyCircledXLargeStyling = (note, keyIndices) => {
      if (!note || !keyIndices || keyIndices.length === 0) return;
      try {
        const keyProps = (typeof note.getKeyProps === "function" && note.getKeyProps()) || [];
        let changed = false;
        keyIndices.forEach((i) => {
          const kp = keyProps?.[i];
          if (!kp) return;
          if (kp.code !== CUSTOM_CIRCLED_X_LARGE_GLYPH) {
            kp.code = CUSTOM_CIRCLED_X_LARGE_GLYPH;
            changed = true;
          }
        });
        if (changed && typeof note.reset === "function") note.reset();
      } catch (_) {}
    };
    const applyTupletEdgeInsetDraw = (tuplet) => {
      if (!tuplet || tuplet.__dgInsetPatched) return;
      tuplet.__dgInsetPatched = true;
      const originalDraw = tuplet.draw.bind(tuplet);
      tuplet.draw = function drawTupletWithInset() {
        const inset = Math.max(0, Number(this.options?.edge_inset) || 0);
        if (!this.bracketed || inset <= 0 || !Array.isArray(this.notes) || this.notes.length < 2) {
          return originalDraw();
        }

        const first = this.notes[0];
        const last = this.notes[this.notes.length - 1];
        const origLeft = first.getTieLeftX?.bind(first);
        const origRight = last.getTieRightX?.bind(last);
        if (!origLeft || !origRight) return originalDraw();

        first.getTieLeftX = () => origLeft() + inset;
        last.getTieRightX = () => origRight() - inset;
        try {
          return originalDraw();
        } finally {
          first.getTieLeftX = origLeft;
          last.getTieRightX = origRight;
        }
      };
    };
;

    if (!ref.current) return;
    ref.current.innerHTML = "";

    const quarterCount = Math.max(1, Math.round((timeSig.n * 4) / timeSig.d));
    const baseSubdivPerQuarter = Math.max(1, Math.round(resolution / 4));
    const resolvedQuarterSubsByBar =
      Array.isArray(quarterSubdivisionsByBar) && quarterSubdivisionsByBar.length === bars
        ? quarterSubdivisionsByBar.map((row) =>
            Array.from({ length: quarterCount }, (_, i) => Math.max(1, Number(row?.[i]) || baseSubdivPerQuarter))
          )
        : Array.from({ length: bars }, () =>
            Array.from({ length: quarterCount }, () => baseSubdivPerQuarter)
          );

    const resolvedStepOffsets =
      Array.isArray(barStepOffsets) && barStepOffsets.length === bars + 1
        ? barStepOffsets
        : (() => {
            const out = [0];
            for (let b = 0; b < bars; b++) {
              const steps = resolvedQuarterSubsByBar[b].reduce((sum, n) => sum + Math.max(1, Number(n) || 1), 0);
              out.push(out[b] + steps);
            }
            return out;
          })();
    const hasTuplets = resolvedQuarterSubsByBar.some((row) =>
      row.some((n) => Math.max(1, Number(n) || 1) !== baseSubdivPerQuarter)
    );

    if (hasTuplets) {
      const tupletDisplayBase = (subdiv) => {
        const s = Math.max(1, Number(subdiv) || 1);
        // Keep tuplet note values stable across global resolution changes:
        // 3->2 (eighth-triplet), 5/6/7->4 (sixteenth-based), 9->8 (thirty-second-based), etc.
        let base = 1;
        while (base * 2 <= s) base *= 2;
        return Math.max(1, Math.min(8, base));
      };
      const durationFromBase = (subdiv) => {
        const s = Math.max(1, Number(subdiv) || 1);
        if (s <= 1) return "q";
        if (s <= 2) return "8";
        if (s <= 4) return "16";
        return "32";
      };
      const durationFromLen = (lenSteps, baseStepsPerQuarter) => {
        const base = Math.max(1, Number(baseStepsPerQuarter) || 1);
        const len = Math.max(1, Math.min(base, Number(lenSteps) || 1));
        const ratio = base / len;
        const denom = 4 * ratio;
        if (denom === 4) return "q";
        return String(denom);
      };

      const perLine = Math.max(1, Math.min(bars, Number(barsPerLine) || 1));
      const naturalBarWidths = Array.from({ length: bars }, (_, b) => {
        const steps = Math.max(1, (resolvedStepOffsets[b + 1] ?? 0) - (resolvedStepOffsets[b] ?? 0));
        return Math.max(180, Math.round(92 + steps * 20));
      });
      const rows = Math.ceil(bars / perLine);
      const systemHeight = 160;
      const height = 60 + rows * systemHeight;
      const naturalRowWidths = Array.from({ length: rows }, (_, rowIdx) => {
        const start = rowIdx * perLine;
        const end = Math.min(bars, start + perLine);
        let sum = 0;
        for (let b = start; b < end; b++) sum += naturalBarWidths[b];
        return sum;
      });
      const targetRowWidth =
        Number.isFinite(Number(targetContentWidth)) && Number(targetContentWidth) > 200
          ? Math.round(Number(targetContentWidth))
          : (naturalRowWidths.length ? Math.max(...naturalRowWidths) : 0);
      const rowWidths = naturalRowWidths.map((w, rowIdx) => {
        if (!justifySystems) return w;
        const start = rowIdx * perLine;
        const end = Math.min(bars, start + perLine);
        const barsInRow = Math.max(1, end - start);
        const proportional = Math.round((targetRowWidth * barsInRow) / perLine);
        return Math.max(80 * barsInRow, proportional);
      });
      const barWidths = Array(bars).fill(0);
      for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
        const start = rowIdx * perLine;
        const end = Math.min(bars, start + perLine);
        const nat = Math.max(1, naturalRowWidths[rowIdx] || 1);
        const dst = Math.max(1, rowWidths[rowIdx] || nat);
        let consumed = 0;
        for (let b = start; b < end; b++) {
          if (b === end - 1) {
            barWidths[b] = Math.max(80, dst - consumed);
          } else {
            const scaled = Math.max(80, Math.round((naturalBarWidths[b] / nat) * dst));
            barWidths[b] = scaled;
            consumed += scaled;
          }
        }
      }
      const width = 20 + (rowWidths.length ? Math.max(...rowWidths) : 0);

      const renderer = new Renderer(ref.current, Renderer.Backends.SVG);
      renderer.resize(width, height);
      const ctx = renderer.getContext();

      const staves = [];
      const voices = [];
      const beamsByBar = Array.from({ length: bars }, () => []);
      const tupletsByBar = Array.from({ length: bars }, () => []);

      for (let b = 0; b < bars; b++) {
        const row = Math.floor(b / perLine);
        const col = b % perLine;
        const rowStartBar = row * perLine;
        let x = 10;
        for (let bi = rowStartBar; bi < rowStartBar + col; bi++) {
          if (bi >= bars) break;
          x += barWidths[bi];
        }
        const y = 30 + row * systemHeight;
        const stave = new Stave(x, y, barWidths[b]);
        if (col > 0) stave.setBegBarType(Barline.type.NONE);
        if (col === 0) {
          stave.addClef("percussion");
          if (b === 0) stave.addTimeSignature(`${timeSig.n}/${timeSig.d}`);
        }
        stave.setContext(ctx).draw();
        staves.push(stave);

        const notes = [];
        const beamBuckets = [];
        const tuplets = [];
        const barStart = resolvedStepOffsets[b] ?? 0;
        const barSubs = resolvedQuarterSubsByBar[b] || [];
        let localStep = 0;

        for (let q = 0; q < barSubs.length; q++) {
          const subdiv = Math.max(1, Number(barSubs[q]) || 1);
          const tupletQuarter = subdiv !== baseSubdivPerQuarter;
          const quarterDisplayBase = tupletQuarter ? tupletDisplayBase(subdiv) : baseSubdivPerQuarter;
          const quarterNotes = [];
          const quarterBeamBucket = [];
          const stepData = [];
          for (let sub = 0; sub < subdiv; sub++) {
            const globalIdx = barStart + localStep + sub;
            const keys = [];
            const ghostKeyIndices = [];
            const circledXLargeKeyIndices = [];
            const accentKeyIndices = [];
            instruments.forEach((inst) => {
              const val = grid[inst.id]?.[globalIdx] ?? CELL.OFF;
              if (val === CELL.OFF) return;
              keys.push(NOTATION_MAP[inst.id].key);
              const keyIndex = keys.length - 1;
              if (val === CELL.GHOST && GHOST_NOTATION_ENABLED.has(inst.id)) ghostKeyIndices.push(keyIndex);
              if (val === CELL.ACCENT) accentKeyIndices.push(keyIndex);
              if (inst.id === "china" || inst.id === "hihatOpen") circledXLargeKeyIndices.push(keyIndex);
            });
            const stickingSpec = getStickingSpecForStep(globalIdx);
            stepData.push({ keys, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx });
          }

          const canUseMergedQuarterLogic = subdiv === baseSubdivPerQuarter && (mergeNotes || mergeRests);
          if (canUseMergedQuarterLogic) {
            let sub = 0;
            while (sub < subdiv) {
              const entry = stepData[sub];
              if (entry.keys.length > 0) {
                let len = 1;
                if (mergeNotes) {
                  const canLen = (candidateLen) => {
                    if (candidateLen < 1) return false;
                    if (sub % candidateLen !== 0) return false;
                    if (sub + candidateLen > subdiv) return false;
                    for (let k = 1; k < candidateLen; k++) {
                      if (stepData[sub + k]?.keys.length) return false;
                    }
                    return true;
                  };
                  for (let p = baseSubdivPerQuarter; p >= 1; p = Math.floor(p / 2)) {
                    if (canLen(p)) {
                      len = p;
                      break;
                    }
                  }
                }
                let dotted = false;
                if (mergeNotes && dottedNotes && len >= 2) {
                  const extra = len / 2;
                  if (sub + len + extra <= subdiv) {
                    dotted = true;
                    for (let k = 0; k < extra; k++) {
                      if (stepData[sub + len + k]?.keys.length) {
                        dotted = false;
                        break;
                      }
                    }
                  }
                }

                const note = new StaveNote({
                  keys: entry.keys,
                  duration: durationFromLen(len, baseSubdivPerQuarter),
                  clef: "percussion",
                });
                note.setStemDirection(1);
                if (dotted) attachDot(note);
                applyGhostStyling(note, entry.ghostKeyIndices);
                applyGhostStemOverride(note, entry.ghostKeyIndices);
                applyCircledXLargeStyling(note, entry.circledXLargeKeyIndices);
                applyAccentArticulation(note, entry.accentKeyIndices);
                applyStickingAnnotation(note, entry.stickingSpec, entry.globalIdx);
                notes.push(note);
                quarterNotes.push(note);
                quarterBeamBucket.push(note);
                sub += dotted ? len + len / 2 : len;
                continue;
              }

              if (!mergeRests) {
                const rest = new StaveNote({
                  keys: ["b/4"],
                  duration: `${durationFromBase(quarterDisplayBase)}r`,
                  clef: "percussion",
                });
                notes.push(rest);
                quarterNotes.push(rest);
                sub += 1;
                continue;
              }

              let remain = subdiv - sub;
              let chunk = 1;
              for (let p = baseSubdivPerQuarter; p >= 1; p = Math.floor(p / 2)) {
                if (p <= remain && sub % p === 0) {
                  chunk = p;
                  break;
                }
              }
              const restDur = `${durationFromLen(chunk, baseSubdivPerQuarter)}r`;
              const rest = new StaveNote({ keys: ["b/4"], duration: restDur, clef: "percussion" });
              notes.push(rest);
              quarterNotes.push(rest);
              sub += chunk;
            }
          } else {
            for (let sub = 0; sub < subdiv; sub++) {
              const entry = stepData[sub];
              const note = entry.keys.length
                ? new StaveNote({ keys: entry.keys, duration: durationFromBase(quarterDisplayBase), clef: "percussion" })
                : new StaveNote({ keys: ["b/4"], duration: `${durationFromBase(quarterDisplayBase)}r`, clef: "percussion" });
              if (entry.keys.length) note.setStemDirection(1);
              applyGhostStyling(note, entry.ghostKeyIndices);
              applyGhostStemOverride(note, entry.ghostKeyIndices);
              applyCircledXLargeStyling(note, entry.circledXLargeKeyIndices);
              applyAccentArticulation(note, entry.accentKeyIndices);
              applyStickingAnnotation(note, entry.stickingSpec, entry.globalIdx);
              notes.push(note);
              quarterNotes.push(note);
              if (entry.keys.length) quarterBeamBucket.push(note);
            }
          }

          beamBuckets.push(quarterBeamBucket);
          if (subdiv !== baseSubdivPerQuarter && quarterNotes.length > 1) {
            try {
              const t = new Vex.Flow.Tuplet(quarterNotes, {
                num_notes: subdiv,
                notes_occupied: quarterDisplayBase,
                bracketed: true,
                ratioed: false,
                y_offset: subdiv === 6 ? -6 : 0,
                edge_inset: 1.5,
              });
              applyTupletEdgeInsetDraw(t);
              tuplets.push(t);
            } catch (_) {}
          }
          localStep += subdiv;
        }

        const voice = new Voice({ num_beats: timeSig.n, beat_value: timeSig.d });
        voice.setStrict(false);
        voice.addTickables(notes);
        voices.push(voice);

        try {
          const quarterBeams = [];
          beamBuckets.forEach((bucket) => {
            if (!bucket.length) return;
            const beams = Beam.generateBeams(bucket, {
              groups: [new Fraction(1, timeSig.d)],
              stem_direction: 1,
              beam_rests: false,
              flat_beams: !!flatBeams,
            });
            quarterBeams.push(...beams);
          });
          beamsByBar[b] = quarterBeams;
        } catch (_) {
          beamsByBar[b] = [];
        }
        tupletsByBar[b] = tuplets;
      }

      for (let b = 0; b < bars; b++) {
        const formatter = new Formatter().joinVoices([voices[b]]);
        formatter.formatToStave([voices[b]], staves[b]);
        voices[b].draw(ctx, staves[b]);
        drawStickingSpecsForVoice(voices[b]);
        (beamsByBar[b] || []).forEach((beam) => {
          try {
            const beamNotes = (typeof beam.getNotes === "function" ? beam.getNotes() : beam.notes) || [];
            const ghostNotes = beamNotes.filter(
              (n) => !!n?.__dgHasGhost && typeof n.getStemLength === "function" && typeof n.setStemLength === "function"
            );
            if (ghostNotes.length) {
              const targetStem = Math.max(
                ...beamNotes.map((n) => (typeof n?.getStemLength === "function" ? n.getStemLength() : 0))
              );
              if (targetStem > 0) {
                ghostNotes.forEach((n) => n.setStemLength(targetStem));
                beam.postFormatted = false;
                beam.postFormat?.();
              }
            }
          } catch (_) {}
          beam.setContext(ctx).draw();
        });
        (tupletsByBar[b] || []).forEach((tuplet) => {
          try { tuplet.setContext(ctx).draw(); } catch (_) {}
        });
      }
      drawArrangementTextMarkers(staves, perLine);
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
        paintActiveBarHighlights(svg, staves);
      }
      return;
    }

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
    const naturalBarWidths = Array.from({ length: bars }, () => barWidth);
    const perLine = Math.max(1, Math.min(bars, Number(barsPerLine) || 1));
    const rows = Math.ceil(bars / perLine);
    const systemHeight = 160;
    const height = 60 + rows * systemHeight;
    const naturalRowWidths = Array.from({ length: rows }, (_, rowIdx) => {
      const start = rowIdx * perLine;
      const end = Math.min(bars, start + perLine);
      let sum = 0;
      for (let b = start; b < end; b++) sum += naturalBarWidths[b];
      return sum;
    });
    const targetRowWidth =
      Number.isFinite(Number(targetContentWidth)) && Number(targetContentWidth) > 200
        ? Math.round(Number(targetContentWidth))
        : (naturalRowWidths.length ? Math.max(...naturalRowWidths) : 0);
    const rowWidths = naturalRowWidths.map((w, rowIdx) => {
      if (!justifySystems) return w;
      const start = rowIdx * perLine;
      const end = Math.min(bars, start + perLine);
      const barsInRow = Math.max(1, end - start);
      const proportional = Math.round((targetRowWidth * barsInRow) / perLine);
      return Math.max(80 * barsInRow, proportional);
    });
    const barWidths = Array(bars).fill(0);
    for (let rowIdx = 0; rowIdx < rows; rowIdx++) {
      const start = rowIdx * perLine;
      const end = Math.min(bars, start + perLine);
      const nat = Math.max(1, naturalRowWidths[rowIdx] || 1);
      const dst = Math.max(1, rowWidths[rowIdx] || nat);
      let consumed = 0;
      for (let b = start; b < end; b++) {
        if (b === end - 1) {
          barWidths[b] = Math.max(80, dst - consumed);
        } else {
          const scaled = Math.max(80, Math.round((naturalBarWidths[b] / nat) * dst));
          barWidths[b] = scaled;
          consumed += scaled;
        }
      }
    }
    const width = 20 + (rowWidths.length ? Math.max(...rowWidths) : 0);

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
      const rowStartBar = row * perLine;
      let x = 10;
      for (let bi = rowStartBar; bi < rowStartBar + col; bi++) {
        if (bi >= bars) break;
        x += barWidths[bi];
      }
      const y = 30 + row * systemHeight;
      const stave = new Stave(x, y, barWidths[b]);

      // Remove repeated left barline so bars connect visually
      if (col > 0) stave.setBegBarType(Barline.type.NONE);

      if (col === 0) {
        stave.addClef("percussion");
        if (b === 0) stave.addTimeSignature(`${timeSig.n}/${timeSig.d}`);
      }

      stave.setContext(ctx).draw();
      staves.push(stave);

      const notes = [];
      const noteStarts = [];
      const pushNote = (n, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec = [], stepIdx = -1) => {
        applyGhostStyling(n, ghostKeyIndices);
        applyGhostStemOverride(n, ghostKeyIndices);
        applyCircledXLargeStyling(n, circledXLargeKeyIndices);
        applyAccentArticulation(n, accentKeyIndices);
        applyStickingAnnotation(n, stickingSpec, stepIdx);
        notes.push(n);
        noteStarts.push(s);
      };

      let s = 0;
      while (s < stepsPerBar) {
        const globalIdx = b * stepsPerBar + s;
        const stickingSpec = getStickingSpecForStep(globalIdx);

        const keys = [];
        const ghostKeyIndices = [];
        const circledXLargeKeyIndices = [];
        const accentKeyIndices = [];

        instruments.forEach((inst) => {
          const val = grid[inst.id][globalIdx];
          if (val !== CELL.OFF) {
            keys.push(NOTATION_MAP[inst.id].key);
            const keyIndex = keys.length - 1;
            if (val === CELL.GHOST && GHOST_NOTATION_ENABLED.has(inst.id)) {
              ghostKeyIndices.push(keyIndex);
            }
            if (val === CELL.ACCENT) {
              accentKeyIndices.push(keyIndex);
            }
            if (inst.id === "china" || inst.id === "hihatOpen") {
              circledXLargeKeyIndices.push(keyIndex);
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
              pushNote(noteQ, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);
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
                pushNote(noteQ, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);
                s += 4;
                continue;
              }
            }
            if ((subInBeat === 0 || subInBeat === 2) && s + 1 < stepsPerBar) {
              const next = b * stepsPerBar + (s + 1);
              if (isStepEmpty(next)) {
                const note8 = new StaveNote({ keys, duration: "8", clef: "percussion" });
                note8.setStemDirection(1);
                pushNote(note8, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);
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
            pushNote(note, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);

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
              pushNote(note8, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);
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

        pushNote(note, ghostKeyIndices, circledXLargeKeyIndices, accentKeyIndices, stickingSpec, globalIdx);
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
      drawStickingSpecsForVoice(voices[b]);
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

    drawArrangementTextMarkers(staves, perLine);


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
      paintActiveBarHighlights(svg, staves);
    }
  }, [instruments, grid, stickingAssignmentsByStep, showNotationSticking, notationStickingView, resolution, bars, barsPerLine, stepsPerBar, timeSig, quarterSubdivisionsByBar, barStepOffsets, mergeRests, mergeNotes, dottedNotes, flatBeams, justifySystems, targetContentWidth, activeBarIndices, sectionMarkers, tempoMarkers, showSystemBarNumbers, barNumberOffset]);

  return <div ref={ref} />;

}
