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
MAX_EXPOSED_CHUNK_BYTES=50000

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

echo "VERIFY OK"
echo "  remoteEntry.js: $(wc -c <"$DIST/remoteEntry.js" | tr -d ' ') bytes"
echo "  exposed chunk:  $(basename "$EXPOSED_CHUNK") ($CHUNK_BYTES bytes)"
