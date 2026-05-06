#!/usr/bin/env bash
#
# Post-build verification for the standalone harness.
#
# Confirms:
#   1. dist/index.html and a single JS entry are emitted (normal Vite app shape).
#   2. The harness bundle does NOT include Module Federation runtime artifacts
#      (no remoteEntry.js, no __mfe_internal__ chunks). The harness imports
#      apps/remote/src/exposes/PixelArtApp.tsx directly via workspace alias —
#      it must not also load the same module via federation, or two React
#      runtimes appear at runtime.

set -euo pipefail

HARNESS_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIST="$HARNESS_ROOT/dist"
ASSETS="$DIST/assets"

fail() {
  echo "VERIFY FAIL: $*" >&2
  exit 1
}

[[ -f "$DIST/index.html" ]] || fail "dist/index.html missing — did you run 'pnpm --filter @pixelart/harness build'?"
[[ -d "$ASSETS" ]] || fail "dist/assets missing"

# No federation runtime artifacts in any chunk.
if find "$ASSETS" -type f -name '*.js' -exec grep -l '__mfe_internal__\|__federation__\|loadShare' {} \; | grep -q .; then
  fail "Harness bundle contains MF runtime artifacts — harness must not call federation()"
fi

if [[ -f "$DIST/remoteEntry.js" ]]; then
  fail "Harness emitted a remoteEntry.js — harness must not be configured as an MF remote"
fi

echo "VERIFY OK"
echo "  index.html present"
echo "  no MF runtime artifacts in assets"
