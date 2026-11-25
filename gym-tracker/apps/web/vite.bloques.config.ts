import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

const snapshot = fileURLToPath(new URL("./.local/rutina.json", import.meta.url));

export default mergeConfig(base, defineConfig({
  plugins: [{
    name: "local-block-routine",
    configureServer(server) {
      if (server.config.env.VITE_BLOCKS_CLOUD === "true") return;
      server.middlewares.use(async (request, response, next) => {
        if (request.method !== "GET" || request.url !== "/_local/rutina.json") return next();
        try {
          const data = await readFile(snapshot);
          response.setHeader("Content-Type", "application/json; charset=utf-8");
          response.setHeader("Cache-Control", "private, no-store");
          response.end(data);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
  }],
}));
