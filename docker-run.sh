#!/bin/bash
set -e

IMAGE_NAME="guadalcanal-simplified"
REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"

if [[ -z "$ANTHROPIC_API_KEY" ]]; then
  echo "Error: ANTHROPIC_API_KEY is not set" >&2
  exit 1
fi

docker build -t "$IMAGE_NAME" "$REPO_ROOT"

docker run -it --rm \
  -v "$REPO_ROOT:/workspace" \
  -e ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  "$IMAGE_NAME"
