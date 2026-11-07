import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const apiTarget = process.env.API_URL ?? "http://localhost:8787";
// The camera only works in a secure context. HTTPS=1 serves the dev server over
// HTTPS with a self-signed certificate so it can be opened from a phone on the LAN.
const https = process.env.HTTPS === "1";

export default defineConfig({
  plugins: [
    react(),
    ...(https ? [basicSsl()] : []),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Kortkollen – värdera fotbollskort",
        short_name: "Kortkollen",
        description: "Fota ett fotbollskort och få identifiering, skick och marknadsvärde.",
        lang: "sv",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#0b1410",
        theme_color: "#0b1410",
        categories: ["utilities", "shopping", "sports"],
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": apiTarget },
  },
  preview: {
    proxy: { "/api": apiTarget },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
