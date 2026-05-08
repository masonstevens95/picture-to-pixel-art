#!/usr/bin/env bash
#
# Post-build verification for the federated remote.
#
# Confirms:
#   1. dist/remoteEntry.js is emitted.
#   2. The exposed PixelArtApp module ships as a tiny chunk (no bundled React).
#   3. React internals identifiers do not appear in the exposed chunk.
#
# Run AFTER `pnpm --filter @pixelart/remote build`. This script is intentionally
# a shell utility and not a Vitest test — Vitest-spawned `vite build` does not
# pick up the @module-federation/vite plugin under all environments, so a real
# CLI build is the more honest check.

set -euo pipefail

REMOTE_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$REMOTE_ROOT/dist"
ASSETS="$DIST/assets"
# Hard ceiling per v3 plan + scope-guardian doc-review, updated for v4.2.
#
# Sizing rationale (raw, not gzipped):
#   v1   final exposed chunk:  8886 bytes (~3.0 KB gzipped)
#   v2   final exposed chunk: 20810 bytes (~6.6 KB gzipped)
#   v3    final exposed chunk: 31169 bytes (~8.7 KB gzipped)
#   v4    final exposed chunk: 38149 bytes (~10.3 KB gzipped)
#   v4.2  final exposed chunk: ~46000 bytes (~11.5 KB gzipped)
#   v4.2b final exposed chunk: ~52000 bytes (~13.0 KB gzipped)
#
#   v3 → v4 delta raw: +6980 bytes. v4 plan budgeted up to 110 KB (3.2x
#   v3) anticipating the ORT-Web JS adapter, MediaPipe Tasks shim, and
#   ML/ scaffolding could land in the exposed chunk. The actual outcome
#   landed far under that ceiling because Vite's lazy `import('onnxruntime-web/wasm')`
#   and `import('@mediapipe/tasks-vision')` (and the `worker.format: 'es'`
#   config that allows code-splitting inside the worker) pushed all the
#   ML weight into separate chunks loaded on demand:
#     dist/assets/pixelArtWorker-*.js     ~70 KB  worker bundle
#     dist/assets/ort.wasm.bundle.min-*.js ~71 KB  ORT JS adapter (lazy)
#     dist/assets/vision_bundle-*.js      ~138 KB  MediaPipe Tasks shim (lazy)
#     dist/assets/ort-wasm-simd-threaded-*.wasm ~12.5 MB  ORT WASM binary (lazy)
#
#   v4 → v4.2 delta raw: ~+7900 bytes. The cartoon-shaping pass added
#   seven dials (silhouette mask close, subject dilation, tight crop +
#   margin + subject-aspect, flat-fill enable + colors), each landing
#   per-filter preset fields, dialsMatchPreset checks, hook plumbing,
#   and ~120 lines of UI inside SilhouetteControl. Pipeline-side
#   modules (silhouetteMorph, tightCrop, flatFill) go into the WORKER
#   bundle, not the exposed chunk. The grep guards below confirm no
#   React internals / ORT / MediaPipe got bundled — growth is pure
#   feature surface.
#
#   v4.2 → v4.2b delta raw: ~+6000 bytes. Preset round-trip — embed
#   every dial as a tEXt chunk in the downloaded PNG, parse on drop
#   to restore dials. Adds the PresetDropZone component, PNG metadata
#   read/write helpers (incl. CRC-32 table), preset shape definition,
#   and the buildPreset/handlePresetLoad callbacks in PixelArtApp.
#   Worker bundle is unaffected — none of this code runs in the
#   pipeline.
#
#   Ceiling set at v4.2b-measured + ~4 KB headroom = 60000 bytes raw.
#
# Builds that exceed this fail loudly so the budget stays enforced, not
# aspirational. If a future change pushes past 60 KB, that's the signal
# to revisit — likely a heavy import has accidentally become eager.
MAX_EXPOSED_CHUNK_BYTES=60000

fail() {
  echo "VERIFY FAIL: $*" >&2
  exit 1
}

[[ -f "$DIST/remoteEntry.js" ]] || fail "dist/remoteEntry.js is missing — did you run 'pnpm --filter @pixelart/remote build'?"
[[ -d "$ASSETS" ]] || fail "dist/assets/ is missing"

EXPOSED_CHUNK="$(find "$ASSETS" -maxdepth 1 -type f -name 'PixelArtApp-*.js' | head -n 1 || true)"
[[ -n "$EXPOSED_CHUNK" ]] || fail "Could not find exposed PixelArtApp chunk in dist/assets/"

CHUNK_BYTES=$(wc -c <"$EXPOSED_CHUNK" | tr -d ' ')
if (( CHUNK_BYTES > MAX_EXPOSED_CHUNK_BYTES )); then
  fail "Exposed chunk $EXPOSED_CHUNK is $CHUNK_BYTES bytes (> $MAX_EXPOSED_CHUNK_BYTES); React may have been bundled"
fi

# React's internals dispatcher symbols only appear when React itself is bundled,
# not when the chunk merely imports React via the federation shared scope.
if grep -qE 'ReactCurrentDispatcher|ReactCurrentOwner' "$EXPOSED_CHUNK"; then
  fail "Exposed chunk contains React internals — React appears to be bundled into the remote"
fi

# v4 ML-not-bundled check (multi-pronged per doc-review).
#
# v4 lazy-loads ORT-Web (~5MB JS+WASM) and MediaPipe Tasks (~3-4MB .task) on
# first cartoon-filter use. Models live in browser Cache Storage, NOT in the
# JS chunk. If any of these checks fail, an import accidentally became eager
# or a model file slipped into the build output.

# 1. No .onnx or .task model files emitted as assets.
if find "$ASSETS" -maxdepth 1 -type f \( -name '*.onnx' -o -name '*.task' \) | grep -q .; then
  fail "dist/assets/ contains a model file (.onnx or .task) — model assets must NOT be bundled; they are fetched at runtime from external CDNs into Cache Storage"
fi

# 2. ORT and MediaPipe runtimes must be SEPARATE chunks (lazy), not inlined into
#    the exposed chunk. Detect by absence of obvious ORT/MediaPipe bundle markers
#    in the exposed chunk. (Their lazy chunks live alongside in dist/assets/.)
if grep -qE 'onnxruntime-web|InferenceSession\.create' "$EXPOSED_CHUNK"; then
  fail "Exposed chunk references ORT runtime directly — onnxruntime-web should be lazy-imported in the worker only"
fi
if grep -qE 'FaceLandmarker|FilesetResolver' "$EXPOSED_CHUNK"; then
  fail "Exposed chunk references MediaPipe Tasks directly — @mediapipe/tasks-vision should be lazy-imported in the worker only"
fi

# 3. Confirm the lazy chunks DO exist (proves the imports are split, not just absent).
if ! find "$ASSETS" -maxdepth 1 -type f -name 'ort.wasm.bundle*.js' | grep -q .; then
  fail "ORT lazy chunk (ort.wasm.bundle*.js) not found in dist/assets/ — ORT may not be split as expected"
fi
if ! find "$ASSETS" -maxdepth 1 -type f -name 'vision_bundle*.js' | grep -q .; then
  fail "MediaPipe lazy chunk (vision_bundle*.js) not found in dist/assets/ — MediaPipe may not be split as expected"
fi

echo "VERIFY OK"
echo "  remoteEntry.js: $(wc -c <"$DIST/remoteEntry.js" | tr -d ' ') bytes"
echo "  exposed chunk:  $(basename "$EXPOSED_CHUNK") ($CHUNK_BYTES bytes)"
echo "  ML chunks: lazy-loaded ORT + MediaPipe + worker (separate chunks)"
echo "  Model files: NOT bundled (fetched at runtime into Cache Storage)"
