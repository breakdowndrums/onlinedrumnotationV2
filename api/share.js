import crypto from "node:crypto";
import { isKvReady, kvConfigStatus, kvGet, kvSetJsonWithExpiry } from "./_kv.js";

const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const MAX_PAYLOAD_BYTES = 120000;

function makeId() {
  return crypto.randomBytes(6).toString("base64url");
}

function stableSerializeValue(value) {
  if (value == null) return "null";
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeValue(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerializeValue(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isPlainObjectRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function buildCanonicalBeatPayload(payload) {
  if (!isPlainObjectRecord(payload)) return null;
  const timeSig = isPlainObjectRecord(payload.timeSig)
    ? {
        n: Math.max(1, Number(payload.timeSig.n) || 4),
        d: Math.max(1, Number(payload.timeSig.d) || 4),
      }
    : { n: 4, d: 4 };
  const tupletsByBar = isPlainObjectRecord(payload.tupletsByBar)
    ? Object.fromEntries(
        Object.entries(payload.tupletsByBar)
          .map(([key, value]) => [String(key), value])
          .sort(([a], [b]) => a.localeCompare(b))
      )
    : {};
  const grid = isPlainObjectRecord(payload.grid)
    ? Object.fromEntries(
        Object.entries(payload.grid)
          .map(([instId, events]) => [
            String(instId),
            Array.isArray(events)
              ? events
                  .map((event) =>
                    Array.isArray(event)
                      ? [Math.max(0, Number(event[0]) || 0), Math.max(0, Number(event[1]) || 0)]
                      : null
                  )
                  .filter(Boolean)
              : [],
          ])
          .filter(([, events]) => events.length > 0)
          .sort(([a], [b]) => a.localeCompare(b))
      )
    : {};
  const notationStickingSelection =
    isPlainObjectRecord(payload.notationStickingSelection)
      ? Object.fromEntries(
          Object.entries(payload.notationStickingSelection)
            .filter(([, value]) => value === true)
            .sort(([a], [b]) => a.localeCompare(b))
        )
      : undefined;
  const stickingOverrides =
    isPlainObjectRecord(payload.stickingOverrides)
      ? Object.fromEntries(
          Object.entries(payload.stickingOverrides)
            .filter(
              ([key, value]) =>
                typeof key === "string" &&
                key.includes(":") &&
                (value === "L" || value === "R")
            )
            .sort(([a], [b]) => a.localeCompare(b))
        )
      : undefined;
  const next = {
    v: Number(payload.v) || 1,
    name: String(payload.name || "").trim(),
    composer: String(payload.composer || "").trim(),
    category: String(payload.category || "").trim(),
    style: String(payload.style || "").trim(),
    kitInstrumentIds: Array.isArray(payload.kitInstrumentIds)
      ? [...new Set(payload.kitInstrumentIds.map((id) => String(id || "")).filter(Boolean))]
      : [],
    bars: Math.max(1, Number(payload.bars) || 1),
    resolution: Math.max(1, Number(payload.resolution) || 8),
    timeSig,
    bpm: Math.max(20, Math.min(400, Number(payload.bpm) || 120)),
    layout:
      payload.layout === "grid-right" ||
      payload.layout === "notation-right" ||
      payload.layout === "notation-top"
        ? payload.layout
        : "grid-top",
    showNotationSticking: payload.showNotationSticking !== false,
    notationStickingView: payload.notationStickingView === "split-rows" ? "split-rows" : "above",
    tupletsByBar,
    grid,
    stickingHandedness: payload.stickingHandedness === "left" ? "left" : "right",
    stickingLeadHand: payload.stickingLeadHand === "left" ? "left" : "right",
    stickingKeepQuarterLeadHand: payload.stickingKeepQuarterLeadHand !== false,
  };
  if (notationStickingSelection && Object.keys(notationStickingSelection).length) {
    next.notationStickingSelection = notationStickingSelection;
  }
  if (stickingOverrides && Object.keys(stickingOverrides).length) {
    next.stickingOverrides = stickingOverrides;
  }
  return next;
}

function buildCanonicalArrangementPayload(payload) {
  if (!isPlainObjectRecord(payload)) return null;
  const beats = Array.isArray(payload.beats) ? payload.beats : [];
  const beatIndexById = new Map();
  const normalizedBeats = beats.map((beat, index) => {
    const beatId = String(beat?.id || "");
    if (beatId) beatIndexById.set(beatId, index);
    return {
      name: String(beat?.name || "").trim() || `Beat ${index + 1}`,
      category: String(beat?.category || "Groove"),
      style: beat?.style ? String(beat.style) : "",
      timeSigCategory: String(beat?.timeSigCategory || "4/4"),
      bpm: Math.max(20, Math.min(400, Number(beat?.bpm) || Number(beat?.payload?.bpm) || 120)),
      payload: buildCanonicalBeatPayload(beat?.payload || {}),
    };
  });
  const normalizedItems = (Array.isArray(payload.items) ? payload.items : [])
    .map((item) => ({
      beatIndex: Math.max(0, beatIndexById.get(String(item?.beatId || "")) ?? 0),
      repeats: Math.max(1, Number(item?.repeats) || 1),
    }));
  return {
    v: Number(payload.v) || 1,
    kind: "arrangement",
    name: String(payload.name || "").trim() || "Arrangement",
    titleLine1: String(payload.titleLine1 || "").trim(),
    titleLine2: String(payload.titleLine2 || "").trim(),
    composer: String(payload.composer || "").trim(),
    beats: normalizedBeats,
    items: normalizedItems,
  };
}

function buildCanonicalSharePayload(payload) {
  if (!isPlainObjectRecord(payload)) return null;
  if (String(payload.kind || "") === "arrangement") {
    return buildCanonicalArrangementPayload(payload);
  }
  return {
    kind: "beat",
    payload: buildCanonicalBeatPayload(payload),
  };
}

function makeDeterministicAnonymousShareId(payload) {
  const canonical = buildCanonicalSharePayload(payload);
  const serialized = stableSerializeValue(canonical);
  const digest = crypto.createHash("sha256").update(serialized).digest("base64url");
  return `a-${digest.slice(0, 16)}`;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch (_) {
      return null;
    }
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return null;
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch (_) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isKvReady()) {
    return res.status(503).json({ error: "Share storage not configured", kv: kvConfigStatus() });
  }

  try {
    const body = await readJsonBody(req);
    const payload = body?.payload;
    if (!payload || typeof payload !== "object") {
      return res.status(400).json({ error: "Missing payload" });
    }
    const serialized = JSON.stringify(payload);
    if (serialized.length > MAX_PAYLOAD_BYTES) {
      return res.status(413).json({ error: "Payload too large" });
    }

    const deterministicId = makeDeterministicAnonymousShareId(payload);
    const deterministicKey = `share:${deterministicId}`;
    const existingDeterministic = await kvGet(deterministicKey);
    if (existingDeterministic != null) {
      try {
        const parsed = typeof existingDeterministic === "string"
          ? JSON.parse(existingDeterministic)
          : existingDeterministic;
        if (parsed?.payload) {
          const existingSerialized = stableSerializeValue(buildCanonicalSharePayload(parsed.payload));
          const incomingSerialized = stableSerializeValue(buildCanonicalSharePayload(payload));
          if (existingSerialized === incomingSerialized) {
            return res.status(200).json({ id: deterministicId, created: false });
          }
        }
      } catch (_) {}
    }

    let id = "";
    if (existingDeterministic == null) {
      id = deterministicId;
    } else {
      for (let i = 0; i < 6; i++) {
        const candidate = makeId();
        const key = `share:${candidate}`;
        const exists = await kvGet(key);
        if (exists == null) {
          id = candidate;
          break;
        }
      }
    }
    if (!id) return res.status(500).json({ error: "Failed to allocate share id" });

    await kvSetJsonWithExpiry(
      `share:${id}`,
      { v: 1, payload, createdAt: new Date().toISOString() },
      SHARE_TTL_SECONDS
    );
    return res.status(200).json({ id, created: true });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save share", detail: String(err?.message || err) });
  }
}
