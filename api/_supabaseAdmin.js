import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseServiceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || "";
const adminEmail = String(process.env.VITE_ADMIN_EMAIL || process.env.ADMIN_EMAIL || "").trim().toLowerCase();

export const hasSupabaseAdmin = Boolean(supabaseUrl && supabaseServiceRoleKey);

export const supabaseAdmin = hasSupabaseAdmin
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export async function getRequestUser(req) {
  if (!hasSupabaseAdmin || !supabaseAdmin) return { user: null, isAdmin: false };
  const authHeader = String(req.headers.authorization || req.headers.Authorization || "").trim();
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, isAdmin: false };
  const token = match[1];
  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) return { user: null, isAdmin: false };
    const user = data.user;
    const email = String(user.email || "").trim().toLowerCase();
    return {
      user,
      isAdmin: Boolean(user.id && adminEmail && email === adminEmail),
    };
  } catch (_) {
    return { user: null, isAdmin: false };
  }
}
