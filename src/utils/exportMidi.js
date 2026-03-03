function toVarLen(value) {
  let v = Math.max(0, value | 0);
  const bytes = [v & 0x7f];
  while ((v >>= 7)) {
    bytes.unshift((v & 0x7f) | 0x80);
  }
  return bytes;
}

function writeU16BE(n) {
  return [(n >> 8) & 0xff, n & 0xff];
}

function writeU32BE(n) {
  return [(n >> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function sanitizeFilename(name) {
  const base = String(name || "drum-grid")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
  return base || "drum-grid";
}

function denominatorPowerOfTwo(d) {
  let p = 0;
  let n = Math.max(1, d | 0);
  while (n > 1) {
    n >>= 1;
    p += 1;
  }
  return p;
}

function textBytes(text) {
  const s = String(text || "");
  if (typeof TextEncoder !== "undefined") {
    return Array.from(new TextEncoder().encode(s));
  }
  // ASCII fallback
  return Array.from(s).map((ch) => ch.charCodeAt(0) & 0x7f);
}

function metaTextEvent(type, text) {
  const bytes = textBytes(text);
  return [0xff, type & 0xff, ...toVarLen(bytes.length), ...bytes];
}

export function exportDrumMidi({
  grid,
  instruments,
  columns,
  resolution,
  bpm,
  timeSig,
  title = "",
  composer = "",
  filename = "drum-grid",
}) {
  if (!grid || !Array.isArray(instruments) || instruments.length === 0) {
    throw new Error("No instrument data to export.");
  }
  if (!Number.isFinite(columns) || columns <= 0) {
    throw new Error("No steps to export.");
  }

  const PPQ = 480;
  const ticksPerStep = Math.max(1, Math.round((PPQ * 4) / Math.max(1, Number(resolution) || 16)));
  const noteLen = Math.max(1, Math.floor(ticksPerStep * 0.95));
  const channel = 9; // MIDI channel 10 (0-based)
  const onStatus = 0x90 | channel;
  const offStatus = 0x80 | channel;

  const events = [];
  for (const inst of instruments) {
    if (!inst || !Number.isFinite(inst.midi)) continue;
    const row = grid[inst.id] || [];
    for (let step = 0; step < columns; step++) {
      const cell = row[step] ?? "off";
      if (cell === "off") continue;
      const tick = step * ticksPerStep;
      const velocity = cell === "ghost" ? 56 : 100;
      events.push({ tick, type: "on", note: inst.midi, velocity });
      events.push({ tick: tick + noteLen, type: "off", note: inst.midi, velocity: 0 });
    }
  }

  events.sort((a, b) => {
    if (a.tick !== b.tick) return a.tick - b.tick;
    if (a.type === b.type) return 0;
    return a.type === "off" ? -1 : 1;
  });

  const track = [];
  if (title.trim()) track.push(...toVarLen(0), ...metaTextEvent(0x03, title.trim())); // Track name
  if (composer.trim()) track.push(...toVarLen(0), ...metaTextEvent(0x01, `Composer: ${composer.trim()}`));
  const tempo = Math.max(1, Math.round(60000000 / Math.max(1, Number(bpm) || 120)));
  track.push(
    ...toVarLen(0),
    0xff,
    0x51,
    0x03,
    (tempo >> 16) & 0xff,
    (tempo >> 8) & 0xff,
    tempo & 0xff
  );

  const tsn = Math.max(1, Number(timeSig?.n) || 4);
  const tsd = Math.max(1, Number(timeSig?.d) || 4);
  track.push(...toVarLen(0), 0xff, 0x58, 0x04, tsn & 0xff, denominatorPowerOfTwo(tsd) & 0xff, 24, 8);

  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.tick - lastTick;
    lastTick = ev.tick;
    track.push(...toVarLen(delta), ev.type === "on" ? onStatus : offStatus, ev.note & 0x7f, ev.velocity & 0x7f);
  }

  track.push(...toVarLen(0), 0xff, 0x2f, 0x00);

  const header = [
    0x4d, 0x54, 0x68, 0x64, // MThd
    ...writeU32BE(6),
    ...writeU16BE(0), // format 0
    ...writeU16BE(1), // one track
    ...writeU16BE(PPQ),
  ];
  const trackChunkHeader = [0x4d, 0x54, 0x72, 0x6b, ...writeU32BE(track.length)];
  const bytes = new Uint8Array([...header, ...trackChunkHeader, ...track]);

  const blob = new Blob([bytes], { type: "audio/midi" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(filename)}.mid`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
