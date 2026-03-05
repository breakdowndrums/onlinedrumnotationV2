import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

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

preloadSharedStateIfNeeded().finally(() => {
  ReactDOM.createRoot(document.getElementById("root")).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
