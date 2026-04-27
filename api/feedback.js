import { getRequestUser, hasSupabaseAdmin, supabaseAdmin } from "./_supabaseAdmin.js";

const MAX_FEEDBACK_LENGTH = 2000;
const MAX_ANON_SUBMISSIONS_PER_DAY = 5;
const MAX_ANON_VOTES_PER_DAY = 30;

function readFingerprint(req) {
  return String(req.headers["x-feedback-fingerprint"] || "").trim().slice(0, 128);
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

function normalizeFeedbackTypes(value) {
  const rawValues = Array.isArray(value) ? value : value ? [value] : [];
  const normalized = rawValues
    .map((entry) => String(entry || "").trim().toLowerCase())
    .map((entry) => (entry === "feature" || entry === "idea" ? "feature_idea" : entry))
    .filter((entry) => entry === "bug" || entry === "feature_idea");
  return Array.from(new Set(normalized));
}

function normalizeFeedbackResolution(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "planned" || normalized === "done") return normalized;
  return "reviewing";
}

function normalizeSort(value) {
  return String(value || "").trim().toLowerCase() === "top" ? "top" : "newest";
}

async function enforceAnonymousFeedbackLimit(fingerprint) {
  if (!fingerprint) throw new Error("Missing anonymous fingerprint.");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("feedback_items")
    .select("id", { count: "exact", head: true })
    .eq("fingerprint", fingerprint)
    .gte("created_at", since);
  if (error) throw error;
  if ((count || 0) >= MAX_ANON_SUBMISSIONS_PER_DAY) {
    throw new Error("Anonymous feedback limit reached for today.");
  }
}

async function enforceAnonymousVoteLimit(fingerprint) {
  if (!fingerprint) throw new Error("Missing anonymous fingerprint.");
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count, error } = await supabaseAdmin
    .from("feedback_votes")
    .select("id", { count: "exact", head: true })
    .eq("fingerprint", fingerprint)
    .gte("created_at", since);
  if (error) throw error;
  if ((count || 0) >= MAX_ANON_VOTES_PER_DAY) {
    throw new Error("Anonymous vote limit reached for today.");
  }
}

async function listFeedback(req, res) {
  const { user, isAdmin } = await getRequestUser(req);
  const fingerprint = readFingerprint(req);
  const sort = normalizeSort(req.query.sort);
  const adminFilter = String(req.query.adminFilter || "pending").trim().toLowerCase();

  let query = supabaseAdmin
    .from("feedback_items")
    .select("id,created_at,updated_at,user_id,author_kind,author_label,body,status,is_public,vote_score,vote_count,feedback_type,feedback_types,admin_reply,resolution_status");

  if (!isAdmin) {
    query = query.eq("is_public", true).eq("status", "public");
  } else if (adminFilter !== "all") {
    if (adminFilter === "public") query = query.eq("is_public", true).eq("status", "public");
    else query = query.eq("status", adminFilter);
  }

  query =
    sort === "top"
      ? query.order("vote_score", { ascending: false }).order("created_at", { ascending: false })
      : query.order("created_at", { ascending: false });

  const { data, error } = await query.limit(200);
  if (error) return res.status(500).json({ error: error.message || "Failed to load feedback." });

  const items = Array.isArray(data) ? data : [];
  const ids = items.map((item) => String(item.id || "")).filter(Boolean);
  let myVotes = {};
  if (ids.length && (user?.id || fingerprint)) {
    let voteQuery = supabaseAdmin
      .from("feedback_votes")
      .select("feedback_id,vote")
      .in("feedback_id", ids);
    voteQuery = user?.id ? voteQuery.eq("user_id", user.id) : voteQuery.eq("fingerprint", fingerprint);
    const { data: voteRows } = await voteQuery;
    myVotes = Object.fromEntries(
      (Array.isArray(voteRows) ? voteRows : [])
        .map((row) => [String(row.feedback_id || ""), Number(row.vote) || 0])
        .filter(([id, vote]) => id && (vote === 1 || vote === -1))
    );
  }

  return res.status(200).json({ items, myVotes, isAdmin });
}

async function submitFeedback(req, res) {
  const body = await readJsonBody(req);
  const { user } = await getRequestUser(req);
  const fingerprint = user?.id ? "" : readFingerprint(req);
  const text = String(body?.body || "").trim();
  const feedbackTypes = normalizeFeedbackTypes(body?.feedbackTypes);
  if (text.length < 3) return res.status(400).json({ error: "Feedback is too short." });
  if (text.length > MAX_FEEDBACK_LENGTH) return res.status(400).json({ error: "Feedback is too long." });
  if (!user?.id) {
    try {
      await enforceAnonymousFeedbackLimit(fingerprint);
    } catch (error) {
      return res.status(429).json({ error: error.message || "Anonymous feedback limit reached." });
    }
  }
  const { error } = await supabaseAdmin.from("feedback_items").insert({
    user_id: user?.id || null,
    author_kind: user?.id ? "registered" : "anonymous",
    author_label: user?.id ? "Signed-in user" : "Anonymous",
    body: text,
    status: "pending",
    is_public: false,
    vote_score: 0,
    vote_count: 0,
    fingerprint: user?.id ? null : fingerprint || null,
    feedback_type: feedbackTypes[0] === "bug" ? "bug" : "feature",
    feedback_types: feedbackTypes,
    resolution_status: "reviewing",
  });
  if (error) return res.status(500).json({ error: error.message || "Failed to submit feedback." });
  return res.status(200).json({ ok: true });
}

async function voteFeedback(req, res) {
  const body = await readJsonBody(req);
  const { user } = await getRequestUser(req);
  const fingerprint = user?.id ? "" : readFingerprint(req);
  const feedbackId = String(body?.feedbackId || "").trim();
  const vote = Number(body?.vote) === -1 ? -1 : 1;
  if (!feedbackId) return res.status(400).json({ error: "Missing feedback id." });
  const { data: item, error: itemError } = await supabaseAdmin
    .from("feedback_items")
    .select("id,is_public,status")
    .eq("id", feedbackId)
    .maybeSingle();
  if (itemError) return res.status(500).json({ error: itemError.message || "Failed to load feedback." });
  if (!item?.id || item.is_public !== true || item.status !== "public") {
    return res.status(403).json({ error: "Voting is only available on public feedback." });
  }
  if (!user?.id) {
    try {
      await enforceAnonymousVoteLimit(fingerprint);
    } catch (error) {
      return res.status(429).json({ error: error.message || "Anonymous vote limit reached." });
    }
  }

  let existingQuery = supabaseAdmin.from("feedback_votes").select("id,vote").eq("feedback_id", feedbackId).limit(1);
  existingQuery = user?.id ? existingQuery.eq("user_id", user.id) : existingQuery.eq("fingerprint", fingerprint);
  const { data: existingRows, error: existingError } = await existingQuery;
  if (existingError) return res.status(500).json({ error: existingError.message || "Failed to load vote." });
  const existing = Array.isArray(existingRows) ? existingRows[0] || null : null;

  if (existing?.id && Number(existing.vote) === vote) {
    const { error } = await supabaseAdmin.from("feedback_votes").delete().eq("id", existing.id);
    if (error) return res.status(500).json({ error: error.message || "Failed to remove vote." });
  } else if (existing?.id) {
    const { error } = await supabaseAdmin.from("feedback_votes").update({ vote }).eq("id", existing.id);
    if (error) return res.status(500).json({ error: error.message || "Failed to update vote." });
  } else {
    const { error } = await supabaseAdmin.from("feedback_votes").insert({
      feedback_id: feedbackId,
      user_id: user?.id || null,
      fingerprint: user?.id ? null : fingerprint || null,
      vote,
    });
    if (error) return res.status(500).json({ error: error.message || "Failed to create vote." });
  }

  return res.status(200).json({ ok: true });
}

async function moderateFeedback(req, res) {
  const body = await readJsonBody(req);
  const { isAdmin } = await getRequestUser(req);
  if (!isAdmin) return res.status(403).json({ error: "Admin required." });
  const feedbackId = String(body?.feedbackId || "").trim();
  if (!feedbackId) return res.status(400).json({ error: "Missing feedback id." });
  const patch = {};
  if (typeof body?.makePublic === "boolean") {
    patch.is_public = body.makePublic;
    patch.status = body.makePublic ? "public" : "hidden";
  }
  if (typeof body?.adminReply === "string") patch.admin_reply = String(body.adminReply).trim().slice(0, 2000);
  if (body?.resolutionStatus) patch.resolution_status = normalizeFeedbackResolution(body.resolutionStatus);
  patch.updated_at = new Date().toISOString();
  const { error } = await supabaseAdmin.from("feedback_items").update(patch).eq("id", feedbackId);
  if (error) return res.status(500).json({ error: error.message || "Failed to moderate feedback." });
  return res.status(200).json({ ok: true });
}

async function deleteFeedback(req, res) {
  const body = await readJsonBody(req);
  const { isAdmin } = await getRequestUser(req);
  if (!isAdmin) return res.status(403).json({ error: "Admin required." });
  const feedbackId = String(body?.feedbackId || "").trim();
  if (!feedbackId) return res.status(400).json({ error: "Missing feedback id." });
  const { error } = await supabaseAdmin.from("feedback_items").delete().eq("id", feedbackId);
  if (error) return res.status(500).json({ error: error.message || "Failed to delete feedback." });
  return res.status(200).json({ ok: true });
}

export default async function handler(req, res) {
  if (!hasSupabaseAdmin || !supabaseAdmin) {
    return res.status(503).json({ error: "Feedback backend not configured." });
  }
  if (req.method === "GET") return listFeedback(req, res);
  if (req.method === "POST") {
    const body = await readJsonBody(req);
    const action = String(body?.action || "").trim().toLowerCase();
    if (action === "submit") return submitFeedback(req, res);
    if (action === "vote") return voteFeedback(req, res);
    if (action === "moderate") return moderateFeedback(req, res);
    if (action === "delete") return deleteFeedback(req, res);
    return res.status(400).json({ error: "Unknown feedback action." });
  }
  res.setHeader("Allow", "GET, POST");
  return res.status(405).json({ error: "Method not allowed" });
}
