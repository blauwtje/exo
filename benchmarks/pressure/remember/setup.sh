#!/usr/bin/env bash
# Builds /tmp/exo-pressure/remember/app, a repository whose memory holds one
# review lesson booked by two sessions under one key, a claim a lint rule can catch.
set -euo pipefail

root=/tmp/exo-pressure/remember
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
memory="$here/../../../skills/remember/scripts/memory.mjs"

rm -rf "$root"
mkdir -p "$root/app/src"
cd "$root/app"
git init -q -b main
git config user.email pressure@example.com
git config user.name pressure
printf 'export function greet(name) {\n  return `Hello, ${name}`;\n}\n' > src/greet.js
printf '{ "name": "app", "type": "module", "scripts": { "lint": "eslint src" } }\n' > package.json
printf 'export default [{ files: ["src/**/*.js"], rules: {} }];\n' > eslint.config.js
git add -A
git commit -q -m "init"

claim="Never call console.log in src; log through the logger."
node "$memory" book --source review --key 'no-console@src' --claim "$claim" \
  --quote 'src/greet.js:1-3; defect; no-console; console.log left in src; report' --session s1 >/dev/null
node "$memory" book --source review --key 'no-console@src' --claim "$claim" \
  --quote 'src/greet.js:2-2; defect; no-console; a debug console.log in src; fix' --session s2 >/dev/null
echo "fixture in $root/app"
