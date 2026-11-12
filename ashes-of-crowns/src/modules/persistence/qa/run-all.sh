#!/bin/sh
# Runs the full QA suite for the persistence module. Requires: node 20+, tsx, typescript, esbuild, playwright + chromium.
# Usage (from the project root):  sh src/modules/persistence/qa/run-all.sh
set -e
M=src/modules/persistence
echo "== typecheck =="; npx tsc --noEmit -p .
echo "== unit tests (node:test) =="; npx tsx --test $M/qa/tests/*.test.ts
echo "== bundle for browser tests =="; npx esbuild $M/index.ts --bundle --format=iife --global-name=Persistence --target=es2020 --outfile=$M/qa/browser/www/persistence.js --log-level=error
echo "== real-browser tests (Chromium via Playwright) =="; node $M/qa/browser/run.mjs
