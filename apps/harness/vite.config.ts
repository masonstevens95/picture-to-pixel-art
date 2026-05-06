import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * The harness is a normal Vite app — NO @module-federation/vite plugin.
 * It imports `apps/remote/src/exposes/PixelArtApp.tsx` directly via the
 * workspace-aliased path below. Going through federation would create a
 * dual-runtime situation (host + harness both loading remoteEntry.js) and
 * defeat the dev workflow.
 */
export default defineConfig({
  base: "/",
  plugins: [react()],
  resolve: {
    alias: {
      "@pixelart/remote/exposes": resolve(here, "../remote/src/exposes"),
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 5173,
    strictPort: true,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
