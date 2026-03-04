#!/bin/bash
# build.sh — Build recipe-book artifact for Nomad deployment.
#
# Produces a tarball with app source + node_modules (prod only).
#
# Usage:
#   bash build.sh <output-dir> <platform>
#
# Arguments:
#   output-dir   Directory to write the tarball (default: .)
#   platform     Docker platform string (default: linux/arm64)
#
# Environment:
#   NODE_IMAGE   Docker image for building (default: node:25-slim)
#
# Examples:
#   bash build.sh /tmp/artifacts linux/arm64
#   bash build.sh ./out linux/amd64
set -euo pipefail

APP_NAME="recipe-book"
SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
OUT_DIR="${1:-.}"
PLATFORM="${2:-linux/arm64}"
ARCH_SUFFIX="${PLATFORM##*/}"  # arm64, amd64, etc.
TARBALL="${APP_NAME}-${ARCH_SUFFIX}.tar.gz"

IMAGE="${NODE_IMAGE:-node:25-slim}"

echo "Building $APP_NAME"
echo "  Platform: $PLATFORM"
echo "  Image:    $IMAGE"
echo "  Output:   $OUT_DIR/$TARBALL"

docker run --rm --platform "$PLATFORM" \
  -v "$SRC_DIR":/src:ro \
  -v npm-cache:/root/.npm \
  -v "$(cd "$OUT_DIR" && pwd)":/out \
  "$IMAGE" \
  bash -c '
    set -e
    mkdir -p /build && cp -a /src/. /build/ && cd /build

    # Clean install prod deps only
    rm -rf node_modules
    npm install --omit=dev --silent 2>&1

    # Strip non-runtime files
    rm -rf .git .DS_Store test_notes/ references/ openspec/ \
           Makefile supervisor.conf package-lock.json

    tar czf /out/'"$TARBALL"' .
  '

SIZE=$(wc -c < "$OUT_DIR/$TARBALL" | tr -d ' ')
echo "Built $TARBALL ($(( SIZE / 1024 ))KB)"
