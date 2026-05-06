import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Default jsdom environment for component / hook / pure-logic tests.
 *
 * Browser-mode tests (Worker + OffscreenCanvas + createImageBitmap) wait
 * until U3 lands the worker pipeline and need a real browser to run in;
 * a vitest.workspace.ts will be added at that point with a dedicated
 * Playwright project. For now, all *.test.{ts,tsx} files run in jsdom.
 *
 * The workspace alias mirrors apps/harness/vite.config.ts so tests
 * importing the federated module's source file resolve identically to
 * the harness's runtime resolution.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@pixelart/remote/exposes": resolve(here, "apps/remote/src/exposes"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: [
      "**/*.browser.test.{ts,tsx}",
      "**/node_modules/**",
      "**/dist/**",
    ],
  },
});
