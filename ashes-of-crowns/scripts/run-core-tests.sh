#!/usr/bin/env bash
set -euo pipefail

printf '\n== Player core ==\n'
npx tsx --test src/modules/player/tests/core.test.ts

printf '\n== World / story ==\n'
npx tsx src/modules/world/tests/run-tests.ts

printf '\n== RPG ==\n'
npx tsx src/modules/rpg/tests/rpg.test.ts

printf '\n== Combat core ==\n'
npx tsc -p tsconfig.core.json
mkdir -p build/combat-core
printf '{"type":"commonjs"}' > build/combat-core/package.json
node src/modules/combat/tests/run-tests.cjs

printf '\n== Persistence unit tests ==\n'
npx tsx --test src/modules/persistence/qa/tests/*.test.ts

printf '\n== UI strict typecheck ==\n'
npx tsc -p src/modules/ui/tsconfig.json

printf '\n== Cross-module integration smoke ==\n'
npx tsx scripts/integration-smoke.ts

printf '\nAll available headless checks passed. Browser/Android QA is still a separate step.\n'
