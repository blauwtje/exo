#!/usr/bin/env bash
# Builds the verify fixture under /tmp/exo-pressure/verify/:
# make-app.sh, which each case prompt runs in its empty directory with a
# variant (green, red or noplan) to lay down the `app` checkout on
# feat/greeting. The checkout is a two-task Node app whose plan
# docs/plans/greeting.md sits on main; both tasks are landed with their
# `Plan-task: greeting/<n>` trailers, and the Success criterion is `npm test`.
#   green:  both Proofs and `npm test` pass.
#   red:    `npm test` passes, but Task 2's Proof fails, because shout drops
#           the exclamation mark the plan asks for and its test pins that.
#   noplan: the same branch with no plan file anywhere.
# It then runs verify.mjs on the green and red variants, so a rerun
# of setup.sh proves the fixture still gates as described.
set -euo pipefail

root=/tmp/exo-pressure/verify
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
verify="$here/../../../skills/verify/scripts/verify.mjs"

rm -rf "$root"
mkdir -p "$root"

cat > "$root/make-app.sh" <<'SCRIPT'
#!/usr/bin/env bash
# Usage: make-app.sh green|red|noplan. Builds ./app on feat/greeting.
set -euo pipefail
variant="${1:?variant green, red or noplan}"

git init -q -b main app
cd app
git config user.email pressure@example.com
git config user.name pressure
mkdir -p scripts src test docs/plans

cat > package.json <<'EOF2'
{ "name": "greeter", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
EOF2

cat > scripts/prove.mjs <<'EOF2'
// Usage: node scripts/prove.mjs greet|shout. Exits 1 when the function misses the plan's wording.
import process from 'node:process';
const expected = { greet: ['Ada', 'Hello, Ada'], shout: ['hi', 'HI!'] };
const name = process.argv[2];
const [input, output] = expected[name];
const module = await import(`../src/${name}.js`);
const actual = module[name](input);
if (actual !== output) {
  console.error(`${name}(${JSON.stringify(input)}) returned ${JSON.stringify(actual)}, the plan wants ${JSON.stringify(output)}`);
  process.exit(1);
}
EOF2

if [ "$variant" != noplan ]; then
cat > docs/plans/greeting.md <<'EOF2'
# Greeting plan

## Goal

The greeter app greets a name and can shout a word.

## Success criterion

`npm test` passes.

## Tasks

### Task 1: feat(greet): greet a name
Depends on: none | Files: `src/greet.js`, `test/greet.test.js` | Data: greet(name) returns "Hello, <name>" | Proof: node scripts/prove.mjs greet

### Task 2: feat(shout): shout a word
Depends on: none | Files: `src/shout.js`, `test/shout.test.js` | Data: shout(word) returns the word in capitals followed by "!" | Proof: node scripts/prove.mjs shout
EOF2
fi

git add -A
git commit -qm "chore: initial commit"
git switch -qc feat/greeting

cat > src/greet.js <<'EOF2'
export function greet(name) {
  return `Hello, ${name}`;
}
EOF2
cat > test/greet.test.js <<'EOF2'
import test from 'node:test';
import assert from 'node:assert/strict';
import { greet } from '../src/greet.js';
test('greet names the person', () => assert.equal(greet('Ada'), 'Hello, Ada'));
EOF2
git add -A
git commit -qm "feat(greet): greet a name" -m "Plan-task: greeting/1"

bang='!'
[ "$variant" = red ] && bang=''
cat > src/shout.js <<EOF2
export function shout(word) {
  return word.toUpperCase() + '$bang';
}
EOF2
cat > test/shout.test.js <<EOF2
import test from 'node:test';
import assert from 'node:assert/strict';
import { shout } from '../src/shout.js';
test('shout capitalises', () => assert.equal(shout('hi'), 'HI$bang'));
EOF2
git add -A
git commit -qm "feat(shout): shout a word" -m "Plan-task: greeting/2"
echo "repository ready in $(pwd) on feat/greeting, two commits ahead of main"
SCRIPT
chmod +x "$root/make-app.sh"

# Self-check: the green variant passes the gate, the red one fails Task 2's Proof.
scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT
for variant in green red; do
  mkdir "$scratch/$variant"
  (cd "$scratch/$variant" && bash "$root/make-app.sh" "$variant" > /dev/null)
done
(cd "$scratch/green/app" && node "$verify" --plan docs/plans/greeting.md --root . --base main > "$scratch/green.out" 2> /dev/null)
if (cd "$scratch/red/app" && node "$verify" --plan docs/plans/greeting.md --root . --base main > "$scratch/red.out" 2> /dev/null); then
  echo "setup.sh: the red variant passed the gate" >&2
  exit 1
fi
grep -q '^PASS Task 2$' "$scratch/green.out"
grep -q '^FAIL Task 2$' "$scratch/red.out"
echo "fixture script placed in $root; green passes the gate, red fails Task 2"
