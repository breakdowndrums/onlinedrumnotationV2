import crypto from "node:crypto";
import { isKvReady, kvGet, kvSetJsonWithExpiry } from "./_kv.js";

const SHARE_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year
const MAX_PAYLOAD_BYTES = 120000;

function makeId() {
  return crypto.randomBytes(6).toString("base64url");
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
    return res.status(503).json({ error: "Share storage not configured" });
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

    let id = "";
    for (let i = 0; i < 6; i++) {
      const candidate = makeId();
      const key = `share:${candidate}`;
      const exists = await kvGet(key);
      if (exists == null) {
        id = candidate;
        break;
      }
    }
    if (!id) return res.status(500).json({ error: "Failed to allocate share id" });

    await kvSetJsonWithExpiry(
      `share:${id}`,
      { v: 1, payload, createdAt: new Date().toISOString() },
      SHARE_TTL_SECONDS
    );
    return res.status(200).json({ id });
  } catch (err) {
    return res.status(500).json({ error: "Failed to save share", detail: String(err?.message || err) });
  }
}
