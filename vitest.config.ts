import { defineConfig } from "vitest/config";

/**
 * Two-project setup so worker / OffscreenCanvas / createImageBitmap tests run
 * in a real browser via Playwright, while protocol and pure-logic tests stay
 * in fast jsdom. Each test file opts in by name suffix:
 *   foo.test.ts        -> jsdom (default)
 *   foo.browser.test.ts -> Playwright (real browser)
 */
export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "jsdom",
          include: ["**/*.test.{ts,tsx}"],
          exclude: ["**/*.browser.test.{ts,tsx}", "**/node_modules/**", "**/dist/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          include: ["**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            provider: "playwright",
            instances: [{ browser: "chromium" }],
            headless: true,
          },
        },
      },
    ],
  },
});
