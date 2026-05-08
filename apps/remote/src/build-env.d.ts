/**
 * Build-time globals injected via `define` in vite.config.ts.
 *
 * `__BUILD_ID__` carries the short git SHA of the deploy (or "dev" in
 * environments without git). Displayed at the bottom of PixelArtApp so
 * users can confirm which build they're looking at when iterating.
 */
declare const __BUILD_ID__: string;
