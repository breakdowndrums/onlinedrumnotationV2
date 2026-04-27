import { getRequestUser, hasSupabaseAdmin, supabaseAdmin } from "./_supabaseAdmin.js";

function readRange(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "day" || normalized === "week") return normalized;
  return "all";
}

function getSinceForRange(range) {
  if (range === "day") return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  if (range === "week") return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  return "";
}

async function countEvents({ eventType, shareKind = "", since = "", distinct = false }) {
  let query = supabaseAdmin
    .from("app_events")
    .select(distinct ? "visitor_id,user_id" : "id", { count: "exact", head: !distinct });
  query = query.eq("event_type", eventType);
  if (shareKind) query = query.eq("share_kind", shareKind);
  if (since) query = query.gte("created_at", since);
  const { data, count, error } = await query;
  if (error) throw error;
  if (!distinct) return Math.max(0, Number(count) || 0);
  const rows = Array.isArray(data) ? data : [];
  const ids = new Set(
    rows
      .map((row) => String(row?.user_id || row?.visitor_id || "").trim())
      .filter(Boolean)
  );
  return ids.size;
}

async function countAuthUsers(since = "") {
  let page = 1;
  const perPage = 1000;
  let total = 0;
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });
    if (error) throw error;
    const users = Array.isArray(data?.users) ? data.users : [];
    total += since
      ? users.filter((user) => {
          const createdAt = String(user?.created_at || "").trim();
          return createdAt && createdAt >= since;
        }).length
      : users.length;
    if (users.length < perPage) break;
    page += 1;
  }
  return total;
}

function isMissingRelationError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist") ||
    message.includes("relation") ||
    message.includes("schema cache")
  );
}

async function safeMetric(label, fn, warnings) {
  try {
    return await fn();
  } catch (error) {
    warnings.push(`${label}: ${error?.message || "failed"}`);
    return 0;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return res.status(405).json({ error: "Method not allowed" });
    }
    if (!hasSupabaseAdmin || !supabaseAdmin) {
      return res.status(503).json({ error: "Stats backend not configured." });
    }
    const { isAdmin } = await getRequestUser(req);
    if (!isAdmin) return res.status(403).json({ error: "Admin required." });

    const range = readRange(req.query.range);
    const since = getSinceForRange(range);
    const warnings = [];
    const users = await safeMetric(
      "Users",
      () => countEvents({ eventType: "site_visit", since, distinct: true }),
      warnings
    );
    const signedUpUsers = await safeMetric("Signed up users", () => countAuthUsers(since), warnings);
    const siteVisits = await safeMetric(
      "Site visits",
      () => countEvents({ eventType: "site_visit", since }),
      warnings
    );
    const beatShareCreates = await safeMetric(
      "Beat share links created",
      () => countEvents({ eventType: "share_create", shareKind: "beat", since }),
      warnings
    );
    const arrangementShareCreates = await safeMetric(
      "Arrangement share links created",
      () => countEvents({ eventType: "share_create", shareKind: "arrangement", since }),
      warnings
    );
    const beatShareOpens = await safeMetric(
      "Beat opens via link / QR",
      () => countEvents({ eventType: "share_open", shareKind: "beat", since }),
      warnings
    );
    const arrangementShareOpens = await safeMetric(
      "Arrangement opens via link / QR",
      () => countEvents({ eventType: "share_open", shareKind: "arrangement", since }),
      warnings
    );

    return res.status(200).json({
      range,
      stats: {
        users,
        signedUpUsers,
        siteVisits,
        beatShareCreates,
        arrangementShareCreates,
        beatShareOpens,
        arrangementShareOpens,
      },
      warnings,
    });
  } catch (error) {
    const message = error?.message || "Failed to load stats.";
    if (isMissingRelationError(error)) {
      return res.status(200).json({
        range: readRange(req?.query?.range),
        stats: {
          users: 0,
          signedUpUsers: 0,
          siteVisits: 0,
          beatShareCreates: 0,
          arrangementShareCreates: 0,
          beatShareOpens: 0,
          arrangementShareOpens: 0,
        },
        warnings: [message],
      });
    }
    return res.status(500).json({ error: message });
  }
}
