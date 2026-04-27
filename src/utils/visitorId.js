export const DG_VISITOR_ID_STORAGE_KEY = "drum-grid-visitor-id-v1";

export function getDrumGridVisitorId() {
  if (typeof window === "undefined") return "";
  try {
    const existing = String(window.localStorage.getItem(DG_VISITOR_ID_STORAGE_KEY) || "").trim();
    if (existing) return existing;
    const next =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : `visitor-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    window.localStorage.setItem(DG_VISITOR_ID_STORAGE_KEY, next);
    return next;
  } catch (_) {
    return "";
  }
}
