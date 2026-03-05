import { isKvReady, kvConfigStatus, kvGet } from "../_kv.js";

const ID_RE = /^[A-Za-z0-9_-]{4,64}$/;

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!isKvReady()) {
    return res.status(503).json({ error: "Share storage not configured", kv: kvConfigStatus() });
  }

  try {
    const id = String(req.query?.id || "");
    if (!ID_RE.test(id)) return res.status(400).json({ error: "Invalid share id" });

    const raw = await kvGet(`share:${id}`);
    if (raw == null) return res.status(404).json({ error: "Share not found" });

    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const payload = parsed?.payload && typeof parsed.payload === "object" ? parsed.payload : null;
    if (!payload) return res.status(404).json({ error: "Share payload missing" });

    return res.status(200).json({ id, payload });
  } catch (err) {
    return res.status(500).json({ error: "Failed to load share", detail: String(err?.message || err) });
  }
}
