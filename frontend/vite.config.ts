import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // generateSW (the default) auto-builds a service worker but has no
      // way to add custom event listeners. Push notifications need a
      // "push" handler, so this needs a hand-written service worker
      // (src/sw.ts) that still does its own Workbox precaching.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      manifest: {
        name: "Dispatch",
        short_name: "Dispatch",
        description: "Self-hosted unified SMS/MMS client across multiple VoIP.ms DIDs",
        theme_color: "#0c1a33",
        background_color: "#0c1a33",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
      },
    }),
  ],
  server: {
    // If your checkout lives on a mapped/network drive (SMB), native
    // fs.watch won't fire there, so HMR needs polling instead. Harmless
    // on a local disk, just marginally less efficient.
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/api": "http://localhost:3001",
      "/ws": { target: "ws://localhost:3001", ws: true },
    },
  },
});
