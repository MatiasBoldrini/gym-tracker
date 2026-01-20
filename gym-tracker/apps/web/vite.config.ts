import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["offline.html", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "Gym Tracker",
        short_name: "GymTracker",
        description: "Minimalist Gym Routine Tracker",
        start_url: "/",
        display: "standalone",
        background_color: "#f5f5f7",
        theme_color: "#000000",
        orientation: "portrait",
        icons: [
          {
            src: "/icons/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/images\/exercises\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "exercise-images",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: /^\/images\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "static-images",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            // NO cachear endpoints que son "fuente de verdad" del usuario.
            // Workbox cachea por URL (no por Authorization) y eso puede servir respuestas viejas/vacías
            // que pisan el estado de la UI (ej: semana/rutina que aparece y desaparece).
            urlPattern: ({ url }) => url.pathname.startsWith("/api/sheets/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/fatiga"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "fatiga-api-cache",
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/bodymap"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "bodymap-api-cache",
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
