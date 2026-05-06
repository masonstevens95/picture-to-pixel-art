# picture-to-pixel-art

Drag and drop a photo, get pixel art back. Ships as a Module Federation remote that plugs into a personal portfolio AND as a standalone web app at its own URL. All conversion runs in the browser — no backend, no upload.

## What it does

- **Drop a photo** — drag-and-drop or click to pick.
- **Resolution slider** — 16, 32, 64, 128, 256 px on the long edge, with live re-pixelation as you drag.
- **Aspect-ratio control** — preserve source, square, portrait, landscape, or custom W:H. Source is center-cropped before downscale.
- **Palette modes** — Auto (16-color Wu quantization from the source, default), Curated (Game Boy DMG, PICO-8, EGA-16), or Custom (paste up to 64 hex codes).
- **Brand colors** — paste hex codes that must appear in the output; they take priority over quantized colors.
- **Saturation** — slider from -1 (grayscale) to +1 (vivid), default 0 (neutral). Applied in HSL space before downscale.
- **PNG download** — exported at native pixel resolution.

The conversion pipeline runs in a Web Worker with `OffscreenCanvas` + `ImageBitmap` so the slider and other controls stay responsive on photographic sources.

## Implementation history

- v1 (`docs/plans/2026-05-06-001-feat-pixel-art-microfrontend-v1-plan.md`): scaffolded the monorepo, MF remote, and standalone harness; shipped drop + resolution slider + side-by-side preview + PNG export.
- v2 (`docs/plans/2026-05-06-002-feat-pixel-art-controls-v2-plan.md`): added aspect-ratio crop, palette modes (auto / curated / custom), brand-color injection, and saturation. v2 defaults reproduce v1 output bit-identically — the simple drop-and-resize flow stays the primary surface; advanced controls are one click away in a collapsible panel.

The full product scope and decisions live in [`docs/brainstorms/2026-05-06-pixel-art-microfrontend-requirements.md`](docs/brainstorms/2026-05-06-pixel-art-microfrontend-requirements.md).

## Repo layout

```
apps/
  remote/    Module Federation remote (`@pixelart/remote`).
             Builds remoteEntry.js + the exposed PixelArtApp chunk.
             Loaded by the portfolio host at runtime via lazy import.
  harness/   Standalone Vite app (`@pixelart/harness`).
             Imports apps/remote/src/exposes/PixelArtApp.tsx directly
             via workspace alias. Deploys at its own URL with minimum
             chrome (header, footer, dark/neutral Tailwind).
docs/
  brainstorms/ Requirements docs from /ce-brainstorm.
  plans/       Implementation plans from /ce-plan.
  deploy.md    Deploy + CORS + smoke-test recipe (read this before
               shipping).
```

The remote does not bundle React or react-dom — they're declared as MF singleton shared deps so the host's React copy is reused at runtime.

## Development

```bash
pnpm install
pnpm dev:harness        # Standalone app at http://localhost:5173
pnpm dev:remote         # Builds remoteEntry.js in watch mode + serves on :5174
pnpm test               # vitest run
pnpm typecheck          # all packages
pnpm lint               # eslint flat config
```

The remote does not support `vite dev` (a known `@module-federation/vite` limitation). For UI iteration, run `dev:harness` — it imports the same exposed component directly. For end-to-end MF testing against the host, run `dev:remote` + the host's dev server pointed at `http://localhost:5174/remoteEntry.js`.

A devcontainer (`./docker-run.sh`) is included for a reproducible environment, but is optional — local Node 20+ and pnpm 10 are sufficient.

## Status

v1 is feature-complete and tested end-to-end. See `docs/deploy.md` to ship.
