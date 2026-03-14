function readU16BE(bytes, offset) {
  return ((bytes[offset] || 0) << 8) | (bytes[offset + 1] || 0);
}

function readU32BE(bytes, offset) {
  return (
    ((bytes[offset] || 0) << 24) |
    ((bytes[offset + 1] || 0) << 16) |
    ((bytes[offset + 2] || 0) << 8) |
    (bytes[offset + 3] || 0)
  ) >>> 0;
}

function readVarLen(bytes, start) {
  let value = 0;
  let offset = start;
  for (let i = 0; i < 4; i++) {
    const b = bytes[offset++];
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return { value, next: offset };
}

function textFromBytes(bytes) {
  if (typeof TextDecoder !== "undefined") {
    try {
      return new TextDecoder("utf-8").decode(Uint8Array.from(bytes));
    } catch (_) {}
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

function decodePayloadMeta(text) {
  const raw = String(text || "");
  if (!raw.startsWith("DG_PAYLOAD:")) return null;
  try {
    const encoded = raw.slice("DG_PAYLOAD:".length);
    const binary = typeof atob === "function" ? atob(encoded) : "";
    const json = decodeURIComponent(
      Array.from(binary)
        .map((ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, "0")}`)
        .join("")
    );
    return JSON.parse(json);
  } catch (_) {
    return null;
  }
}

function clampTupletValue(v) {
  if (v == null) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(2, Math.min(12, Math.round(n)));
}

const GM_NOTE_ALIASES = {
  35: "kick",
  36: "kick",
  37: "sideStick",
  38: "snare",
  40: "snare",
  41: "floorTom",
  43: "floorTom",
  44: "hihatFoot",
  45: "tom2",
  47: "tom2",
  48: "tom1",
  50: "tom1",
  42: "hihat",
  46: "hihatOpen",
  49: "crash1",
  52: "china",
  53: "rideBell",
  51: "ride",
  55: "splash",
  56: "cowbell",
  57: "crash2",
  59: "ride",
};

function buildTupletsByBar(barCount, quarterCount) {
  return Array.from({ length: Math.max(1, barCount) }, () =>
    Array.from({ length: Math.max(1, quarterCount) }, () => null)
  );
}

function getQuarterBeatsPerBar(ts) {
  return Math.max(1, Math.round(Number(ts?.n) || 1));
}

function inferResolution(ppq, noteEvents) {
  const candidates = [4, 8, 16, 32].map((resolution) => ({
    resolution,
    ticksPerStep: Math.max(1, Math.round((ppq * 4) / resolution)),
  }));
  const onTicks = noteEvents.map((event) => Number(event.tick) || 0).sort((a, b) => a - b);
  const deltas = [];
  for (let i = 1; i < onTicks.length; i++) {
    const delta = onTicks[i] - onTicks[i - 1];
    if (delta > 0) deltas.push(delta);
  }
  if (deltas.length) {
    const minDelta = Math.min(...deltas);
    let best = candidates[0];
    let bestDistance = Infinity;
    candidates.forEach((candidate) => {
      const distance = Math.abs(candidate.ticksPerStep - minDelta);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
    return best;
  }

  const durations = noteEvents
    .map((event) => Number(event.durationTicks) || 0)
    .filter((n) => n > 0);
  if (durations.length) {
    const minDuration = Math.min(...durations);
    const estimated = minDuration / 0.95;
    let best = candidates[0];
    let bestDistance = Infinity;
    candidates.forEach((candidate) => {
      const distance = Math.abs(candidate.ticksPerStep - estimated);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    });
    return best;
  }

  return candidates[0];
}

function buildInstrumentLookup(instruments) {
  const byMidi = new Map();
  const byId = new Map();
  (Array.isArray(instruments) ? instruments : []).forEach((inst) => {
    if (!inst?.id) return;
    byId.set(String(inst.id), inst);
    if (Number.isFinite(inst.midi)) byMidi.set(Number(inst.midi), inst);
  });
  return { byMidi, byId };
}

function hasNoteAssignment(noteAssignments, note) {
  return !!(
    noteAssignments &&
    Object.prototype.hasOwnProperty.call(noteAssignments, String(note))
  );
}

function getImportedInstrumentForNote(note, lookups, noteAssignments) {
  if (hasNoteAssignment(noteAssignments, note)) {
    const assignedId = String(noteAssignments[String(note)] || "").trim();
    if (!assignedId || assignedId === "ignore") return null;
    if (lookups.byId.has(assignedId)) return lookups.byId.get(assignedId);
  }
  if (lookups.byMidi.has(note)) return lookups.byMidi.get(note);
  const aliasId = GM_NOTE_ALIASES[note];
  if (aliasId && lookups.byId.has(aliasId)) return lookups.byId.get(aliasId);
  return null;
}

function chooseSubdivisionForSegment(segmentEvents, segmentStartTick, segmentTicks, baseSubdiv) {
  const candidateValues = Array.from(new Set([baseSubdiv, 3, 5, 6, 7, 9])).filter((n) => n >= 1);
  if (!segmentEvents.length) return baseSubdiv;
  let bestSubdiv = baseSubdiv;
  let bestScore = Infinity;
  candidateValues.forEach((subdiv) => {
    const stepTicks = segmentTicks / subdiv;
    let score = 0;
    segmentEvents.forEach((event) => {
      const rel = Math.max(0, Math.min(segmentTicks, event.tick - segmentStartTick));
      const snapped = Math.round(rel / stepTicks) * stepTicks;
      score += Math.abs(rel - snapped);
    });
    // Light penalty against needlessly complex tuplets.
    score += Math.abs(subdiv - baseSubdiv) * 6;
    if (score < bestScore - 1e-6) {
      bestScore = score;
      bestSubdiv = subdiv;
    }
  });
  return bestSubdiv;
}

function getVelocityThresholdForInstrument(instId, velocityThresholds) {
  const id = String(instId || "");
  if (id === "kick" || id === "sideStick") {
    return 0;
  }
  if (id === "snare") {
    return Math.max(1, Math.min(126, Number(velocityThresholds?.snareGhostMax) || 70));
  }
  if (id === "tom1" || id === "tom2" || id === "floorTom") {
    return Math.max(1, Math.min(126, Number(velocityThresholds?.tomGhostMax) || 70));
  }
  if (id === "hihat" || id === "hihatOpen" || id === "hihatFoot") {
    return Math.max(1, Math.min(126, Number(velocityThresholds?.hihatGhostMax) || 70));
  }
  return 0;
}

function getVelocityFamilyForInstrument(instId) {
  const id = String(instId || "");
  if (id === "snare") return "snare";
  if (id === "tom1" || id === "tom2" || id === "floorTom") return "toms";
  if (id === "hihat" || id === "hihatOpen" || id === "hihatFoot") return "hihat";
  return null;
}

function buildVelocityRanges(events) {
  const ranges = {};
  (Array.isArray(events) ? events : []).forEach((event) => {
    const family = getVelocityFamilyForInstrument(event?.instrument?.id);
    const velocity = Number(event?.velocity);
    if (!family || !Number.isFinite(velocity)) return;
    const prev = ranges[family];
    if (!prev) {
      ranges[family] = { min: velocity, max: velocity };
      return;
    }
    ranges[family] = {
      min: Math.min(prev.min, velocity),
      max: Math.max(prev.max, velocity),
    };
  });
  return ranges;
}

function quantizeEventsToPayload({
  events,
  instruments,
  timeSig,
  bpm,
  bars,
  ppq,
  noteAssignments,
  velocityThresholds,
}) {
  const instrumentLookups = buildInstrumentLookup(instruments);
  const filteredEvents = events
    .map((event) =>
      event.instrument
        ? event
        : {
            ...event,
            instrument: getImportedInstrumentForNote(event.note, instrumentLookups, noteAssignments),
          }
    )
    .filter((event) => event.instrument);
  if (!filteredEvents.length) {
    return {
      payload: {
        v: 1,
        kitInstrumentIds: ["hihat", "snare", "kick"],
        bars: Math.max(1, bars),
        resolution: 8,
        timeSig,
        bpm,
        tupletsByBar: buildTupletsByBar(Math.max(1, bars), getQuarterBeatsPerBar(timeSig)),
        grid: {},
      },
    };
  }

  const inferred = inferResolution(ppq, filteredEvents);
  const resolution = inferred.resolution;
  const quarterCount = getQuarterBeatsPerBar(timeSig);
  const baseSubdiv = inferred.ticksPerStep > 0
    ? Math.max(1, Math.round((ppq * (4 / Math.max(1, timeSig.d))) / inferred.ticksPerStep))
    : Math.max(1, Math.round(resolution / Math.max(1, timeSig.d)));
  const segmentTicks = ppq * (4 / Math.max(1, timeSig.d));
  const ticksPerBar = quarterCount * segmentTicks;
  const safeBars = Math.max(1, bars);
  const tupletsByBar = buildTupletsByBar(safeBars, quarterCount);
  const subdivisionsByBar = Array.from({ length: safeBars }, () =>
    Array.from({ length: quarterCount }, () => baseSubdiv)
  );

  for (let barIdx = 0; barIdx < safeBars; barIdx++) {
    for (let qIdx = 0; qIdx < quarterCount; qIdx++) {
      const segmentStartTick = barIdx * ticksPerBar + qIdx * segmentTicks;
      const segmentEvents = filteredEvents.filter(
        (event) => event.tick >= segmentStartTick && event.tick < segmentStartTick + segmentTicks
      );
      const subdiv = chooseSubdivisionForSegment(segmentEvents, segmentStartTick, segmentTicks, baseSubdiv);
      subdivisionsByBar[barIdx][qIdx] = subdiv;
      tupletsByBar[barIdx][qIdx] = subdiv === baseSubdiv ? null : subdiv;
    }
  }

  const gridMap = new Map();
  const stepOffsetsByBar = [];
  let runningStepOffset = 0;
  for (let barIdx = 0; barIdx < safeBars; barIdx++) {
    stepOffsetsByBar[barIdx] = [];
    for (let qIdx = 0; qIdx < quarterCount; qIdx++) {
      stepOffsetsByBar[barIdx][qIdx] = runningStepOffset;
      runningStepOffset += subdivisionsByBar[barIdx][qIdx];
    }
  }

  filteredEvents.forEach((event) => {
    const barIdx = Math.max(0, Math.min(safeBars - 1, Math.floor(event.tick / Math.max(1, ticksPerBar))));
    const tickInBar = event.tick - barIdx * ticksPerBar;
    const qIdx = Math.max(0, Math.min(quarterCount - 1, Math.floor(tickInBar / Math.max(1, segmentTicks))));
    const segmentStartTick = barIdx * ticksPerBar + qIdx * segmentTicks;
    const subdiv = subdivisionsByBar[barIdx][qIdx];
    const localStepTicks = segmentTicks / Math.max(1, subdiv);
    const localStep = Math.max(
      0,
      Math.min(subdiv - 1, Math.round((event.tick - segmentStartTick) / localStepTicks))
    );
    const step = stepOffsetsByBar[barIdx][qIdx] + localStep;
    const ghostMax = getVelocityThresholdForInstrument(event.instrument?.id, velocityThresholds);
    const cellValue = event.velocity <= ghostMax ? 2 : 1;
    const inst = event.instrument;
    const row = gridMap.get(inst.id) || new Map();
    row.set(step, Math.max(cellValue, row.get(step) || 0));
    gridMap.set(inst.id, row);
  });

  const grid = {};
  const usedInstrumentIds = [];
  Array.from(instrumentLookups.byId.values()).forEach((inst) => {
    const row = gridMap.get(inst.id);
    if (!row || row.size < 1) return;
    usedInstrumentIds.push(inst.id);
    grid[inst.id] = Array.from(row.entries()).sort((a, b) => a[0] - b[0]);
  });

  return {
    payload: {
      v: 1,
      kitInstrumentIds: usedInstrumentIds.length ? usedInstrumentIds : ["hihat", "snare", "kick"],
      bars: safeBars,
      resolution,
      timeSig,
      bpm,
      tupletsByBar,
      grid,
    },
  };
}

function buildBarsFromTimeline(maxTick, ppq, tempos, timeSigs) {
  const sortedTempos = [...tempos].sort((a, b) => a.tick - b.tick);
  const sortedTimeSigs = [...timeSigs].sort((a, b) => a.tick - b.tick);
  let tempoIdx = 0;
  let tsIdx = 0;
  let currentTempo = sortedTempos[0]?.bpm || 120;
  let currentTimeSig = sortedTimeSigs[0]
    ? { n: Math.max(1, sortedTimeSigs[0].n || 4), d: Math.max(1, sortedTimeSigs[0].d || 4) }
    : { n: 4, d: 4 };
  let tick = 0;
  const bars = [];
  while (tick <= maxTick) {
    while (tempoIdx + 1 < sortedTempos.length && sortedTempos[tempoIdx + 1].tick <= tick) {
      tempoIdx += 1;
      currentTempo = sortedTempos[tempoIdx].bpm || currentTempo;
    }
    while (tsIdx + 1 < sortedTimeSigs.length && sortedTimeSigs[tsIdx + 1].tick <= tick) {
      tsIdx += 1;
      currentTimeSig = {
        n: Math.max(1, sortedTimeSigs[tsIdx].n || 4),
        d: Math.max(1, sortedTimeSigs[tsIdx].d || 4),
      };
    }
    const quarterCount = getQuarterBeatsPerBar(currentTimeSig);
    const ticksPerBar = quarterCount * ppq * (4 / Math.max(1, currentTimeSig.d));
    const endTick = tick + ticksPerBar;
    bars.push({
      startTick: tick,
      endTick,
      bpm: currentTempo,
      timeSig: { ...currentTimeSig },
    });
    tick = endTick;
  }
  return bars;
}

export function importDrumMidi({
  arrayBuffer,
  instruments,
  arrangementSplitBars = 2,
  noteAssignments = {},
  velocityThresholds = null,
}) {
  const bytes = new Uint8Array(arrayBuffer);
  if (bytes.length < 14) throw new Error("Invalid MIDI file.");
  if (
    bytes[0] !== 0x4d ||
    bytes[1] !== 0x54 ||
    bytes[2] !== 0x68 ||
    bytes[3] !== 0x64
  ) {
    throw new Error("Invalid MIDI header.");
  }

  const headerLength = readU32BE(bytes, 4);
  const format = readU16BE(bytes, 8);
  const trackCount = readU16BE(bytes, 10);
  const division = readU16BE(bytes, 12);
  if (division & 0x8000) throw new Error("SMPTE MIDI timing is not supported.");
  const ppq = division;
  let offset = 8 + headerLength;

  const noteEvents = [];
  const tempos = [];
  const timeSigs = [];
  let title = "";
  let composer = "";
  let embeddedPayload = null;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex++) {
    if (offset + 8 > bytes.length) break;
    if (
      bytes[offset] !== 0x4d ||
      bytes[offset + 1] !== 0x54 ||
      bytes[offset + 2] !== 0x72 ||
      bytes[offset + 3] !== 0x6b
    ) {
      throw new Error("Invalid MIDI track.");
    }
    const trackLength = readU32BE(bytes, offset + 4);
    offset += 8;
    const trackEnd = Math.min(bytes.length, offset + trackLength);
    let tick = 0;
    let runningStatus = null;
    const activeByNote = new Map();

    while (offset < trackEnd) {
      const deltaInfo = readVarLen(bytes, offset);
      tick += deltaInfo.value;
      offset = deltaInfo.next;
      if (offset >= trackEnd) break;
      let status = bytes[offset++];
      if (status < 0x80) {
        if (runningStatus == null) throw new Error("Invalid running status in MIDI.");
        offset -= 1;
        status = runningStatus;
      } else if (status < 0xf0) {
        runningStatus = status;
      }

      if (status === 0xff) {
        const type = bytes[offset++] || 0;
        const lenInfo = readVarLen(bytes, offset);
        const len = lenInfo.value;
        offset = lenInfo.next;
        const data = Array.from(bytes.slice(offset, offset + len));
        offset += len;
        if (type === 0x51 && data.length >= 3) {
          const mpqn =
            ((data[0] || 0) << 16) |
            ((data[1] || 0) << 8) |
            (data[2] || 0);
          tempos.push({
            tick,
            bpm: Math.round(60000000 / Math.max(1, mpqn || 500000)),
          });
        } else if (type === 0x58 && data.length >= 2) {
          timeSigs.push({
            tick,
            n: data[0] || 4,
            d: 2 ** (data[1] || 2),
          });
        } else if ((type === 0x03 || type === 0x01) && data.length) {
          const text = textFromBytes(data).trim();
          if (type === 0x03 && !title) title = text;
          if (type === 0x01) {
            const decodedPayload = decodePayloadMeta(text);
            if (decodedPayload && !embeddedPayload) {
              embeddedPayload = decodedPayload;
              continue;
            }
            if (!composer && /^composer:\s*/i.test(text)) {
              composer = text.replace(/^composer:\s*/i, "").trim();
            } else if (!title && text) {
              title = text;
            }
          }
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        const lenInfo = readVarLen(bytes, offset);
        offset = lenInfo.next + lenInfo.value;
        continue;
      }

      const type = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = bytes[offset++] || 0;
      const data2 = type === 0xc0 || type === 0xd0 ? 0 : bytes[offset++] || 0;

      if (type === 0x90 && data2 > 0) {
        if (format === 0 || channel === 9) {
          const stack = activeByNote.get(data1) || [];
          stack.push({ tick, velocity: data2, channel });
          activeByNote.set(data1, stack);
        }
      } else if (type === 0x80 || (type === 0x90 && data2 === 0)) {
        const stack = activeByNote.get(data1);
        if (stack && stack.length) {
          const start = stack.shift();
          noteEvents.push({
            tick: start.tick,
            durationTicks: Math.max(1, tick - start.tick),
            note: data1,
            velocity: start.velocity,
            channel: start.channel,
          });
          if (!stack.length) activeByNote.delete(data1);
        }
      }
    }
  }

  if (embeddedPayload && typeof embeddedPayload === "object") {
    return {
      kind: "beat",
      payload: embeddedPayload,
      title,
      composer,
    };
  }

  if (!noteEvents.length) throw new Error("No drum notes found in MIDI file.");
  const instrumentLookups = buildInstrumentLookup(instruments);
  const mappedEvents = noteEvents
    .map((event) => ({
      ...event,
      hasExplicitAssignment: hasNoteAssignment(noteAssignments, event.note),
      instrument: getImportedInstrumentForNote(event.note, instrumentLookups, noteAssignments),
    }));
  const usedMappedInstrumentIds = Array.from(
    new Set(
      mappedEvents
        .filter((event) => event.instrument)
        .map((event) => String(event.instrument.id || "").trim())
        .filter(Boolean)
    )
  );
  const velocityRanges = buildVelocityRanges(
    mappedEvents.filter((event) => event.instrument)
  );
  const unmappedCounts = new Map();
  mappedEvents.forEach((event) => {
    if (event.instrument || event.hasExplicitAssignment) return;
    unmappedCounts.set(event.note, (unmappedCounts.get(event.note) || 0) + 1);
  });
  if (unmappedCounts.size) {
    return {
      kind: "needs-mapping",
      title,
      composer,
      hasTempo: tempos.length > 0,
      usedInstrumentIds: usedMappedInstrumentIds,
      velocityRanges,
      unmappedNotes: Array.from(unmappedCounts.entries())
        .map(([note, count]) => ({ note: Number(note), count }))
        .sort((a, b) => a.note - b.note),
    };
  }
  const filteredEvents = mappedEvents
    .filter((event) => event.instrument);
  if (!filteredEvents.length) throw new Error("No mapped drum notes remain after import mapping.");
  const maxTick = filteredEvents.reduce((max, event) => Math.max(max, event.tick), 0);
  const barsTimeline = buildBarsFromTimeline(maxTick, ppq, tempos, timeSigs);
  const hasTimelineChanges = tempos.length > 1 || timeSigs.length > 1;
  const totalBars = barsTimeline.length;
  if (hasTimelineChanges || totalBars > 8) {
    const splitBars = Math.max(1, Math.min(8, Math.round(Number(arrangementSplitBars) || 2)));
    const sections = [];
    let idx = 0;
    let sectionIndex = 1;
    while (idx < barsTimeline.length) {
      const startBar = barsTimeline[idx];
      let endIdx = idx;
      while (
        endIdx + 1 < barsTimeline.length &&
        endIdx - idx + 1 < splitBars &&
        barsTimeline[endIdx + 1].bpm === startBar.bpm &&
        barsTimeline[endIdx + 1].timeSig.n === startBar.timeSig.n &&
        barsTimeline[endIdx + 1].timeSig.d === startBar.timeSig.d
      ) {
        endIdx += 1;
      }
      const sectionStartTick = startBar.startTick;
      const sectionEndTick = barsTimeline[endIdx].endTick;
      const sectionEvents = filteredEvents
        .filter((event) => event.tick >= sectionStartTick && event.tick < sectionEndTick)
        .map((event) => ({ ...event, tick: event.tick - sectionStartTick }));
      const quantized = quantizeEventsToPayload({
        events: sectionEvents,
        instruments,
        timeSig: startBar.timeSig,
        bpm: startBar.bpm,
        bars: endIdx - idx + 1,
        ppq,
        noteAssignments,
        velocityThresholds,
      });
      sections.push({
        name: `${title || "Imported"} ${sectionIndex}`,
        bars: endIdx - idx + 1,
        bpm: startBar.bpm,
        timeSig: startBar.timeSig,
        payload: quantized.payload,
      });
      idx = endIdx + 1;
      sectionIndex += 1;
    }
    return {
      kind: "arrangement",
      title,
      composer,
      hasTempo: tempos.length > 0,
      velocityRanges,
      sections,
    };
  }

  const timeSig = barsTimeline[0]?.timeSig || { n: 4, d: 4 };
  const bpm = Math.max(20, Math.min(400, Number(barsTimeline[0]?.bpm) || 120));
  const quantized = quantizeEventsToPayload({
    events: filteredEvents,
    instruments,
    timeSig,
    bpm,
    bars: totalBars,
    ppq,
    noteAssignments,
    velocityThresholds,
  });
  return {
    kind: "beat",
    payload: quantized.payload,
    title,
    composer,
    hasTempo: tempos.length > 0,
    velocityRanges,
  };
}
