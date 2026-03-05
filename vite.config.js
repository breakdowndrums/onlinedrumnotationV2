import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const seoRouteMap = {
  "/g": "/index.html",
  "/how-to-write-drum-notation": "/how-to-write-drum-notation.html",
  "/drum-notation-cheat-sheet": "/drum-notation-cheat-sheet.html",
  "/drum-groove-notation-examples": "/drum-groove-notation-examples.html",
};

const seoDevRewritePlugin = {
  name: "seo-dev-rewrites",
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ? req.url.split("?")[0] : "";
      if (url.startsWith("/g/")) {
        req.url = "/index.html";
        next();
        return;
      }
      const rewritten = seoRouteMap[url];
      if (rewritten) req.url = rewritten;
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), seoDevRewritePlugin],
});
