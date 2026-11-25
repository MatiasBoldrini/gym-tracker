import { defineConfig, loadEnv, searchForWorkspaceRoot } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { createHash } from "node:crypto";
import path from "node:path";
import { readdir, readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";

const catalogId = "virtual:exercise-illustrations";
const catalogFile = path.resolve(__dirname, "../../Rutina Gym - Gym Tracker - Ejercicios.csv");
const videoDir = path.resolve(__dirname, "public/videos/exercises");

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "public-link-metadata",
      config(_config, { mode }) {
        const env = loadEnv(mode, __dirname, "VITE_BLOCKS_APP_ORIGIN");
        const origin = new URL(env.VITE_BLOCKS_APP_ORIGIN || "https://gym-tracker-hojas.vercel.app").origin;
        return { define: { "import.meta.env.PUBLIC_APP_ORIGIN": JSON.stringify(origin) } };
      },
    },
    {
      name: "exercise-illustrations",
      resolveId(id) { if (id === catalogId) return "\0" + catalogId; },
      async load(id) {
        if (id !== "\0" + catalogId) return;
        this.addWatchFile(catalogFile);
        const files = await readdir(videoDir, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return [];
          throw error;
        });
        const videos = new Map<string, string>();
        for (const file of files) {
          if (!file.isFile() || path.extname(file.name) !== ".mp4") continue;
          const localPath = path.join(videoDir, file.name);
          this.addWatchFile(localPath);
          const revision = createHash("sha256").update(await readFile(localPath)).digest("hex").slice(0, 12);
          videos.set(file.name, "/videos/exercises/" + file.name + "?v=" + revision);
        }
        const rows: { Ejercicio: string; Musculo: string; Imagen: string }[] =
          parse(await readFile(catalogFile, "utf8"), { columns: true, bom: true, skip_empty_lines: true });
        const items = rows.map(row => {
          const filename = path.parse(row.Imagen).name + ".mp4";
          return {
            name: row.Ejercicio, muscle: row.Musculo, file: row.Imagen,
            video: videos.get(filename),
          };
        });
        return "export default " + JSON.stringify(items);
      },
      hotUpdate({ file, modules }) {
        if (path.dirname(file) === videoDir && path.extname(file) === ".mp4") {
          const catalog = this.environment.moduleGraph.getModuleById("\0" + catalogId);
          if (catalog) return [...modules, catalog];
        }
      },
    },
    VitePWA({
      registerType: "autoUpdate",
      // public/manifest.webmanifest is served in development and production.
      manifest: false,
      includeAssets: ["offline.html", "manifest.webmanifest", "icons/*.png", "icons/icon-512.svg"],
      workbox: {
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && /^\/assets\/body-[^/]+\.glb$/.test(url.pathname),
            handler: "CacheFirst",
            options: { cacheName: "fatigue-model", expiration: { maxEntries: 4 } },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/images/exercises/"),
            handler: "CacheFirst",
            options: {
              cacheName: "exercise-images-v2",
              expiration: {
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/images/"),
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
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  server: {
    fs: {
      allow: [searchForWorkspaceRoot(__dirname), path.resolve(__dirname, "../../shared")],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.local/**"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});
