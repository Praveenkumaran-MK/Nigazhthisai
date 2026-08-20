import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Shared root .env across all three apps — see apps/passenger/vite.config.ts
  // for why, and ../../.env.example for the variable list.
  envDir: "../../",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        id: "/",
        name: "Thanjai Transit — District Admin",
        short_name: "Transit Admin",
        description: "Manage stops, routes, fleet, and respond to alerts.",
        theme_color: "#0D2A5D",
        background_color: "#000000",
        display: "standalone",
        orientation: "any",
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
        navigateFallbackDenylist: [/^\/rest\//, /^\/realtime\//, /^\/auth\//],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: { host: true, port: 5175 },
});
