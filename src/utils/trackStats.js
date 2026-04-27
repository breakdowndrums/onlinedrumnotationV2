import { getDrumGridVisitorId } from "./visitorId";

export async function trackClientEvent(eventType, options = {}) {
  const normalizedType = String(eventType || "").trim().toLowerCase();
  if (!normalizedType) return false;
  const visitorId = String(options.visitorId || getDrumGridVisitorId() || "").trim();
  try {
    const headers = {
      "Content-Type": "application/json",
    };
    const authToken = String(options.authToken || "").trim();
    if (authToken) headers.Authorization = `Bearer ${authToken}`;
    await fetch("/api/track", {
      method: "POST",
      headers,
      body: JSON.stringify({
        eventType: normalizedType,
        shareKind: options.shareKind || "",
        path: options.path || (typeof window !== "undefined" ? window.location.pathname || "/" : "/"),
        visitorId,
      }),
    });
    return true;
  } catch (_) {
    return false;
  }
}
