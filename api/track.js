import { getRequestUser, hasSupabaseAdmin, supabaseAdmin } from "./_supabaseAdmin.js";

const ALLOWED_EVENT_TYPES = new Set(["site_visit", "share_open", "share_create"]);
const ALLOWED_SHARE_KINDS = new Set(["", "beat", "arrangement"]);

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
  if (!hasSupabaseAdmin || !supabaseAdmin) {
    return res.status(200).json({ ok: false, skipped: true });
  }

  try {
    const body = await readJsonBody(req);
    const eventType = String(body?.eventType || "").trim().toLowerCase();
    const shareKind = String(body?.shareKind || "").trim().toLowerCase();
    const visitorId = String(body?.visitorId || "").trim().slice(0, 128);
    const path = String(body?.path || "").trim().slice(0, 256);
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: "Invalid event type" });
    }
    if (!ALLOWED_SHARE_KINDS.has(shareKind)) {
      return res.status(400).json({ error: "Invalid share kind" });
    }
    if (!visitorId) {
      return res.status(400).json({ error: "Missing visitor id" });
    }
    const { user } = await getRequestUser(req);
    const { error } = await supabaseAdmin.from("app_events").insert({
      event_type: eventType,
      share_kind: shareKind || null,
      visitor_id: visitorId,
      user_id: user?.id || null,
      path: path || null,
    });
    if (error) return res.status(500).json({ error: error.message || "Failed to track event." });
    return res.status(200).json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to track event." });
  }
}
