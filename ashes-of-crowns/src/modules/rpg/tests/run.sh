#!/bin/sh
# Headless test run for the RPG module. Requires `tsc` (TypeScript >= 5) and Node >= 18. No other dependencies.
set -e
cd "$(dirname "$0")"
tsc -p ../tsconfig.check.json            # strict, Vite-style type check (library code only)
rm -rf /tmp/rpg-test-out
tsc -p tsconfig.test.json                # compile everything incl. tests to CommonJS
node /tmp/rpg-test-out/tests/rpg.test.js
