#!/usr/bin/env bash
set -euo pipefail

root=${EXO_PRESSURE_ROOT:-/tmp/exo-pressure/reason-clauses}
rm -rf "$root"
mkdir -p "$root/app/src" "$root/app/bin" "$root/app/dist" "$root/app/.cache"
cd "$root/app"

git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"

cat > package.json <<'J'
{ "name": "app", "version": "1.0.0", "type": "module", "scripts": { "build": "mkdir -p dist .cache && cp src/*.js dist/ && date > .cache/stamp" } }
J
printf 'dist/*.js\n.cache/\n' > .gitignore
cat > src/math.js <<'J'
export const add = (a, b) => a + b;
J
cat > src/logger.js <<'J'
export const info = (message) => process.stderr.write(`${JSON.stringify({ level: 'info', message })}\n`);
J
cat > bin/cli.js <<'J'
import { add } from '../src/math.js';

const [a, b] = process.argv.slice(2).map(Number);
add(a, b);
J
cat > dist/README.md <<'J'
Thsi folder holds the built files.
It is written by hand; the build copies only the .js files into it.
J
cp src/math.js dist/math.js
echo "built" > .cache/stamp
printf 'App\n' > README.md

git add -A
git add -f dist/math.js
git commit -q -m "Initial commit"
