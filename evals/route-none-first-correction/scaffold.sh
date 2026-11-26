#!/usr/bin/env bash
set -euo pipefail

mkdir -p src
printf 'export function add(a, b) {\n\treturn a + b;\n}\n' > src/a.js
git init -q
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "feat: add the sum helper"
