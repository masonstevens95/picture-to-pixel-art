import { execSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

/**
 * Build-time identifier injected as `__BUILD_ID__` and displayed at the
 * bottom of the app so users can confirm which deploy they're looking at.
 * Prefers Vercel's injected env; falls back to local git; falls back to
 * "dev" when neither is available (e.g. unit tests / CI without git).
 */
const buildId = (() => {
  const vercelSha = process.env.VERCEL_GIT_COMMIT_SHA;
  if (vercelSha) return vercelSha.slice(0, 7);
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
})();

export default defineConfig({
  base: "/",
  define: {
    __BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    federation({
      name: "pixelart_remote",
      filename: "remoteEntry.js",
      exposes: {
        "./PixelArtApp": "./src/exposes/PixelArtApp.tsx",
      },
      shared: {
        react: { singleton: true, strictVersion: true, requiredVersion: "^18.0.0" },
        "react-dom": { singleton: true, strictVersion: true, requiredVersion: "^18.0.0" },
      },
    }),
  ],
  server: {
    port: 5174,
    headers: corsHeaders,
  },
  preview: {
    port: 5174,
    headers: corsHeaders,
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    cssCodeSplit: false,
  },
  // Worker output must be ES modules to support code-splitting / dynamic
  // imports inside worker code. v4 introduces lazy `import('onnxruntime-web/wasm')`
  // and `import('@mediapipe/tasks-vision')` inside the worker; the default
  // `iife` format errors out with "UMD and IIFE output formats are not
  // supported for code-splitting builds."
  worker: {
    format: "es",
  },
});
