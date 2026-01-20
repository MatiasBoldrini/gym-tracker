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
            // Endpoints "críticos" (si se sirven stale, pisan el estado de UI: rutina que aparece y desaparece).
            // Preferimos NetworkFirst para evitar devolver una respuesta vieja cacheada mientras el usuario está online.
            urlPattern: ({ url }) => {
              if (!url.pathname.startsWith("/api/sheets/")) return false;
              if (url.pathname === "/api/sheets/exercise") return false; // NetworkOnly (ver regla abajo)
              return (
                url.pathname === "/api/sheets/home" ||
                url.pathname === "/api/sheets/week" ||
                url.pathname === "/api/sheets/weeks" ||
                url.pathname === "/api/sheets/prs" ||
                url.pathname.startsWith("/api/sheets/routine")
              );
            },
            handler: "NetworkFirst",
            options: {
              cacheName: "sheets-api-cache",
              // El cache key no incluye Authorization, así que NUNCA cacheamos errores/401.
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            // Resto de /api/sheets/*: podemos usar SWR para mejorar UX, pero evitando endpoints críticos de arriba.
            urlPattern: ({ url }) =>
              url.pathname.startsWith("/api/sheets/") &&
              url.pathname !== "/api/sheets/exercise" &&
              url.pathname !== "/api/sheets/home" &&
              url.pathname !== "/api/sheets/week" &&
              url.pathname !== "/api/sheets/weeks" &&
              url.pathname !== "/api/sheets/prs" &&
              !url.pathname.startsWith("/api/sheets/routine"),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "sheets-api-cache",
              cacheableResponse: {
                statuses: [200],
              },
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7,
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname === "/api/sheets/exercise",
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
