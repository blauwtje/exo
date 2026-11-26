#!/usr/bin/env bash
set -euo pipefail

printf 'export const price = 10;\n' > price.js
git init -q
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "feat: add the price"
printf 'export const price = 12;\n' > price.js
git add -A
git -c user.name="Jane Doe" -c user.email=user@example.com commit -q -m "fix: raise the price to 12"
