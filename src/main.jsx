import React from "react";
import ReactDOM from "react-dom/client";
import { Analytics } from "@vercel/analytics/react";
import App from "./App.jsx";
import "./index.css";
import { trackClientEvent } from "./utils/trackStats";

const SITE_VISIT_SESSION_KEY = "drum-grid-site-visit-tracked-v1";

async function preloadSharedStateIfNeeded() {
  const pathname = window.location.pathname || "/";
  const shareMatch = pathname.match(/^\/g\/([A-Za-z0-9_-]{4,64})\/?$/);
  if (!shareMatch) return;
  const shareId = shareMatch[1];
  try {
    const res = await fetch(`/api/share/${encodeURIComponent(shareId)}`, { method: "GET" });
    if (!res.ok) return;
    const data = await res.json();
    if (data?.payload && typeof data.payload === "object") {
      window.__DG_PRELOADED_SHARE_ID = shareId;
      window.__DG_PRELOADED_SHARE_PAYLOAD = data.payload;
    }
  } catch (_) {}
}

function trackSiteVisitOncePerSession() {
  if (typeof window === "undefined") return;
  const pathname = window.location.pathname || "/";
  const sessionKey = `${SITE_VISIT_SESSION_KEY}:${pathname}`;
  try {
    if (window.sessionStorage.getItem(sessionKey) === "1") return;
    window.sessionStorage.setItem(sessionKey, "1");
  } catch (_) {
    // Keep tracking best-effort even if sessionStorage is unavailable.
  }
  void trackClientEvent("site_visit", { path: pathname });
}

preloadSharedStateIfNeeded().finally(() => {
  trackSiteVisitOncePerSession();
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
      <Analytics />
    </React.StrictMode>
  );
});
