import { getRequestUser, hasSupabaseAdmin, supabaseAdmin } from "./_supabaseAdmin.js";

const ANON_SHORT_LINK_DAY_LIMIT = 15;
const ANON_SHORT_LINK_MONTH_LIMIT = 50;
const SIGNED_IN_SHORT_LINK_MONTH_LIMIT = 60;
const SIGNED_IN_BEAT_LIMIT = 1000;
const SIGNED_IN_ARRANGEMENT_LIMIT = 100;

function getSinceIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function readVisitorId(req) {
  return String(req.headers["x-dg-visitor-id"] || req.headers["X-DG-VISITOR-ID"] || "")
    .trim()
    .slice(0, 128);
}

async function countAppEvents({
  eventType,
  since = "",
  userId = "",
  visitorId = "",
}) {
  let query = supabaseAdmin
    .from("app_events")
    .select("id", { count: "exact", head: true })
    .eq("event_type", eventType);
  if (since) query = query.gte("created_at", since);
  if (userId) {
    query = query.eq("user_id", userId);
  } else if (visitorId) {
    query = query.eq("visitor_id", visitorId).is("user_id", null);
  }
  const { count, error } = await query;
  if (error) throw error;
  return Math.max(0, Number(count) || 0);
}

async function countOwnedRows(tableName, userId) {
  const { count, error } = await supabaseAdmin
    .from(tableName)
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return Math.max(0, Number(count) || 0);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!hasSupabaseAdmin || !supabaseAdmin) {
    return res.status(503).json({ error: "Usage limits backend not configured." });
  }

  try {
    const { user } = await getRequestUser(req);
    const visitorId = readVisitorId(req);
    const isSignedIn = Boolean(user?.id);
    if (!isSignedIn && !visitorId) {
      return res.status(400).json({ error: "Missing visitor id." });
    }

    if (isSignedIn) {
      const [shareMonthCount, beatsCount, arrangementsCount] = await Promise.all([
        countAppEvents({
          eventType: "share_create",
          since: getSinceIso(30),
          userId: user.id,
        }),
        countOwnedRows("beats", user.id),
        countOwnedRows("arrangements", user.id),
      ]);
      return res.status(200).json({
        isSignedIn: true,
        shortLinks: {
          permanentAvailable: false,
          defaultRetention: "temporary",
          limits: {
            month: SIGNED_IN_SHORT_LINK_MONTH_LIMIT,
          },
          counts: {
            month: shareMonthCount,
          },
          remaining: {
            month: Math.max(0, SIGNED_IN_SHORT_LINK_MONTH_LIMIT - shareMonthCount),
          },
        },
        cloudLibrary: {
          limits: {
            beats: SIGNED_IN_BEAT_LIMIT,
            arrangements: SIGNED_IN_ARRANGEMENT_LIMIT,
          },
          counts: {
            beats: beatsCount,
            arrangements: arrangementsCount,
          },
          remaining: {
            beats: Math.max(0, SIGNED_IN_BEAT_LIMIT - beatsCount),
            arrangements: Math.max(0, SIGNED_IN_ARRANGEMENT_LIMIT - arrangementsCount),
          },
        },
      });
    }

    const [shareDayCount, shareMonthCount] = await Promise.all([
      countAppEvents({
        eventType: "share_create",
        since: getSinceIso(1),
        visitorId,
      }),
      countAppEvents({
        eventType: "share_create",
        since: getSinceIso(30),
        visitorId,
      }),
    ]);
    return res.status(200).json({
      isSignedIn: false,
      shortLinks: {
        permanentAvailable: false,
        defaultRetention: "temporary",
        limits: {
          day: ANON_SHORT_LINK_DAY_LIMIT,
          month: ANON_SHORT_LINK_MONTH_LIMIT,
        },
        counts: {
          day: shareDayCount,
          month: shareMonthCount,
        },
        remaining: {
          day: Math.max(0, ANON_SHORT_LINK_DAY_LIMIT - shareDayCount),
          month: Math.max(0, ANON_SHORT_LINK_MONTH_LIMIT - shareMonthCount),
        },
      },
      cloudLibrary: null,
    });
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Failed to load usage limits." });
  }
}
