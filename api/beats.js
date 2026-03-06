import crypto from "node:crypto";
import { isKvReady, kvConfigStatus, kvGet, kvSetJsonWithExpiry } from "./_kv.js";

const INDEX_KEY = "beats:index";
const BEAT_KEY_PREFIX = "beat:";
const MAX_BEATS = 2000;
const TTL_SECONDS = 60 * 60 * 24 * 365 * 5; // 5 years

function parseStoredJson(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return fallback;
  }
}

function normalizeName(value) {
  return String(value || "").trim().slice(0, 120);
}

function normalizeCategory(value) {
  const v = String(value || "").trim();
  return v || "Groove";
}

function normalizeStyle(value) {
  const v = String(value || "").trim();
  return v || "";
}
function normalizeComposer(value) {
  const v = String(value || "").trim();
  return v.slice(0, 120);
}
function normalizeTimeSigCategory(value) {
  const v = String(value || "").trim();
  return v || "4/4";
}
function normalizeBpm(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(20, Math.min(400, Math.round(n)));
}

async function readBody(req) {
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
  if (!isKvReady()) {
    return res.status(503).json({ error: "Beat library storage not configured", kv: kvConfigStatus() });
  }

  if (req.method === "POST") {
    try {
      const body = await readBody(req);
      const name = normalizeName(body?.name);
      if (!name) return res.status(400).json({ error: "Beat name is required" });
      const payload = body?.payload;
      if (!payload || typeof payload !== "object") {
        return res.status(400).json({ error: "Missing beat payload" });
      }

      const id = crypto.randomBytes(7).toString("base64url");
      const beat = {
        id,
        name,
        title: name,
        composer: normalizeComposer(body?.composer),
        category: normalizeCategory(body?.category),
        style: normalizeStyle(body?.style),
        timeSigCategory: normalizeTimeSigCategory(body?.timeSigCategory),
        bpm: normalizeBpm(body?.bpm),
        createdAt: new Date().toISOString(),
        source: "public",
        payload,
      };

      await kvSetJsonWithExpiry(`${BEAT_KEY_PREFIX}${id}`, beat, TTL_SECONDS);

      const existingIndex = parseStoredJson(await kvGet(INDEX_KEY), []);
      const nextIndex = [id, ...existingIndex.filter((x) => x !== id)].slice(0, MAX_BEATS);
      await kvSetJsonWithExpiry(INDEX_KEY, nextIndex, TTL_SECONDS);

      return res.status(200).json({ beat });
    } catch (err) {
      return res.status(500).json({ error: "Failed to submit beat", detail: String(err?.message || err) });
    }
  }

  if (req.method === "GET") {
    try {
      const sort = String(req.query?.sort || "latest");
      const categoryFilter = String(req.query?.category || "").trim().toLowerCase();
      const styleFilter = String(req.query?.style || "").trim().toLowerCase();
      const timeSigFilter = String(req.query?.timeSig || "").trim();

      const index = parseStoredJson(await kvGet(INDEX_KEY), []);
      const ids = Array.isArray(index) ? index.slice(0, 300) : [];
      const beats = [];
      for (const id of ids) {
        const beat = parseStoredJson(await kvGet(`${BEAT_KEY_PREFIX}${id}`), null);
        if (!beat || typeof beat !== "object") continue;
        beats.push(beat);
      }

      const filtered = beats.filter((beat) => {
        if (categoryFilter && String(beat.category || "").toLowerCase() !== categoryFilter) return false;
        if (styleFilter && String(beat.style || "").toLowerCase() !== styleFilter) return false;
        if (timeSigFilter && String(beat.timeSigCategory || "") !== timeSigFilter) return false;
        return true;
      });

      filtered.sort((a, b) => {
        const ta = new Date(a?.createdAt || 0).getTime();
        const tb = new Date(b?.createdAt || 0).getTime();
        return sort === "oldest" ? ta - tb : tb - ta;
      });

      return res.status(200).json({ beats: filtered });
    } catch (err) {
      return res.status(500).json({ error: "Failed to load beats", detail: String(err?.message || err) });
    }
  }

  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
