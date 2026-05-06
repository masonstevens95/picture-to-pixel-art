# picture-to-pixel-art

Drag and drop a photo, get pixel art back. Ships as a Module Federation remote that plugs into a personal portfolio AND as a standalone web app at its own URL. All conversion runs in the browser — no backend, no upload.

## v1 scope (currently live)

- **Drop a photo** — drag-and-drop or click to pick.
- **Resolution slider** — 16, 32, 64, 128, 256 px on the long edge, with live re-pixelation as you drag.
- **Side-by-side preview** — source and result, result rendered crisp at any display size.
- **PNG download** — exported at native pixel resolution.

Sensible defaults for everything else: source aspect ratio preserved, auto color quantization (16 colors via image-q's Wu) derived from the source, fully opaque output. The conversion pipeline runs in a Web Worker with `OffscreenCanvas` + `ImageBitmap` so the slider stays responsive on photographic sources.

## Deferred past v1

Aspect-ratio override, curated palettes, brand-color locking, saturation, dithering, multi-image batch — see [`docs/brainstorms/2026-05-06-pixel-art-microfrontend-requirements.md`](docs/brainstorms/2026-05-06-pixel-art-microfrontend-requirements.md) for the full scope discussion and [`docs/plans/2026-05-06-001-feat-pixel-art-microfrontend-v1-plan.md`](docs/plans/2026-05-06-001-feat-pixel-art-microfrontend-v1-plan.md) for the v1 implementation plan.

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
