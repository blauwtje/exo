#!/usr/bin/env bash
set -euo pipefail
printf '# tides\n' > README.md
git init -q
git add -A
commit() { git -c user.name="Jane Doe" -c user.email=user@example.com commit -q --allow-empty -m "$1"; }
commit "feat(tides): add the tide table"
git tag v1.0.0
mkdir -p src
printf 'export const high = 1;\n' > src/high.js
git add -A
commit "feat(tides): show the next high tide"
printf 'export const low = 0;\n' > src/low.js
git add -A
commit "feat(tides): show the next low tide"
printf 'export const rounding = 2;\n' > src/rounding.js
git add -A
commit "fix(tides): round heights to two decimals"
commit "docs(tides): describe the tide table"
