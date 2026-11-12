#!/usr/bin/env bash
# Build the dev harness and run the browser tests.  usage: tests/run.sh   (ONLY=1,2 / VPS=phone-360x740 to narrow)
# Needs: esbuild, playwright (+ Chromium). Paths below are for the original build sandbox; adjust as needed.
set -euo pipefail
cd "$(dirname "$0")/.."
tsc -p tsconfig.json
esbuild dev/main.ts --bundle --format=esm --target=es2020 --outfile=dev/bundle.js --loader:.css=css --log-level=error
node tests/e2e.mjs
