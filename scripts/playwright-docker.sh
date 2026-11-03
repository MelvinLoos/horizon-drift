#!/usr/bin/env sh
# Runs Playwright inside the official image so screenshots are pixel-identical to CI.
# Usage: scripts/playwright-docker.sh [playwright test args…]
set -eu
VERSION=$(node -p "require('@playwright/test/package.json').version")
exec docker run --rm --network host --ipc host \
  -u "$(id -u):$(id -g)" -e HOME=/tmp -e CI="${CI:-}" \
  -v "$PWD":/work -w /work \
  "mcr.microsoft.com/playwright:v${VERSION}-noble" \
  npx playwright test "$@"
