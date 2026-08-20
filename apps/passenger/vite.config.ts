import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// NOTE (browser/platform limitation, documented per spec §1.3 and §50):
// iOS Safari's PWA install requires real PNG apple-touch-icons; SVG-only
// icons will not produce a correct home-screen icon on iOS. This config
// references PNG paths under public/icons/ that you must generate once
// (e.g. `npx pwa-asset-generator public/icons/source.svg public/icons`)
// before shipping to production — a build-time image rasterizer is outside
// what can be produced as a text file in this repository.
export default defineConfig({
  // All three apps share one Supabase project, so they share one root
  // .env instead of three copies that could drift out of sync. Vite only
  // auto-loads .env files from the app's own root by default — this opts
  // into the monorepo root instead. See ../../.env.example.
  envDir: "../../",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        id: "/",
        name: "Thanjai Transit — Passenger",
        short_name: "Transit Passenger",
        description: "Find your bus, track it live, and ride with a QR ticket — no login required.",
        theme_color: "#0D2A5D",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
        // Reference data (stops/routes/fares) can be served stale-while-
        // revalidate; anything under /rest/v1 or /realtime is intentionally
        // NOT cached (live tracking must never render a fake "live" position
        // from a stale cache — see spec §51).
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/rest/v1/stops") || url.pathname.startsWith("/rest/v1/routes"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "sbt-passenger-reference-data" },
          },
        ],
        navigateFallbackDenylist: [/^\/rest\//, /^\/realtime\//, /^\/auth\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5173 },
});
