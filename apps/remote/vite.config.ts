import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { federation } from "@module-federation/vite";

const corsHeaders = { "Access-Control-Allow-Origin": "*" };

export default defineConfig({
  base: "/",
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
