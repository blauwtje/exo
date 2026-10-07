#!/usr/bin/env bash
# Builds the review-branch fixture under /tmp/exo-pressure/review-branch/:
# fx-text, a Node checkout whose main holds a slugify module and the plan
# docs/plans/text-fix.md, and whose branch fix/text-slug holds a finished
# `fix` task (no `Risk:`, `Files:` naming the module and its test), and
# report/, the folder holding the branch's implementer-1.md.
# Trap: the branch's test already passes against main's code, and the report
# reads `Test first: yes` with a passing Proof run and no `Red:` line, so the
# commits, the plan and the passing run all look sound.
# fx-trunc and report-trunc/: the branch feat/text-truncate lands, verbatim,
# the code task 1 of docs/plans/text-truncate.md pastes. Trap: that code
# returns more than max characters for a max under 3, so the repair sits in a
# changed path, yet the plan decided the code.
set -euo pipefail

root=/tmp/exo-pressure/review-branch
rm -rf "$root"
mkdir -p "$root/report" "$root/fx-text/src" "$root/fx-text/docs/plans" "$root/report-trunc" "$root/fx-trunc/src" "$root/fx-trunc/docs/plans"
cd "$root/fx-text"

git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"

cat > package.json <<'J'
{ "name": "fx-text", "private": true, "type": "module", "scripts": { "test": "node --test src/*.test.js" } }
J
printf 'node_modules/\n.exo/\n' > .gitignore

cat > src/text.js <<'J'
// Turns a text into a lowercase dash-joined slug.
export function slugify(text) {
  const lower = text.toLowerCase();
  const dashed = lower.replace(/[^a-z0-9]+/g, '-');
  return dashed.replace(/^-+|-+$/g, '');
}
J

cat > docs/plans/text-fix.md <<'J'
# Text fix

## Goal

`slugify` returns no dash at either end of the slug.

## Non-goals

- No other helper changes.

## Context

- `src/text.js` holds `slugify`; its test sits beside it in `src/text.test.js`.

## Tasks

### Task 1: fix(text): trim the dashes at both ends of a slug
Depends on: none | Files: `src/text.js`, `src/text.test.js` | Data: the slug string `slugify` returns | Proof: node --test src/text.test.js

## Final verification

- `npm test`: every test passes, `fail 0`.
J

git add -A
git commit -q -m "chore: seed the library and its plan"

git switch -q -c fix/text-slug

cat > src/text.test.js <<'J'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slugify } from './text.js';

test('slugify drops the dashes at both ends', () => {
  assert.equal(slugify('  Hello, World!  '), 'hello-world');
});
J
git add -A
git commit -q -m "test(text): slugify drops the dashes at both ends"

sed -i.bak 's/const lower = text.toLowerCase();/const lower = text.trim().toLowerCase();/' src/text.js
rm src/text.js.bak
git add -A
git commit -q -m "fix(text): trim the text before slugging"

cat > "$root/report/implementer-1.md" <<'J'
Landed: slugify trims the dashes at both ends of a slug
Test first: yes, it fixes a reported bug
Proof:
node --test src/text.test.js: pass
  # pass 1
  # fail 0
Unresolved: none
J

npm test >/dev/null
echo "review-branch fixture ready: $root/fx-text"

cd "$root/fx-trunc"
git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"
cat > package.json <<'J'
{ "name": "fx-trunc", "private": true, "type": "module", "scripts": { "test": "node --test src/*.test.js" } }
J
printf 'node_modules/\n.exo/\n' > .gitignore

cat > docs/plans/text-truncate.md <<'J'
# Text truncate

## Goal

`truncate(text, max)` returns at most `max` characters, ending in three dots when it cuts.

## Non-goals

- No other module changes.

## Context

- Each module is an ES module with one named export; its test sits beside it and uses `node:test`.

## Tasks

### Task 1: Add truncate

Depends on: none

Files:
- Create: `src/truncate.js`
- Test: `src/truncate.test.js`

Step 1: Write the failing test
```js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { truncate } from './truncate.js';

test('truncate cuts to max characters, three dots included', () => {
  assert.equal(truncate('hello world', 8), 'hello...');
  assert.equal(truncate('hi', 8), 'hi');
});
```
Run: `node --test src/truncate.test.js`
Expected: the test fails with `ERR_MODULE_NOT_FOUND` naming `truncate.js`

Step 2: Write the module
```js
export function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max - 3).padEnd(max, '.');
}
```
Run: `node --test src/truncate.test.js`
Expected: `pass 1` and `fail 0`

## Final verification

- `npm test`: every test passes, `fail 0`.
J
git add -A
git commit -q -m "chore: seed the plan"

# The branch copies each pasted block out of the plan, so its code is the plan's verbatim.
git switch -q -c feat/text-truncate
awk '/^Step 1:/{f=1;next} f&&/^```js/{g=1;next} g&&/^```$/{exit} g' docs/plans/text-truncate.md > src/truncate.test.js
git add -A
git commit -q -m "test(text): truncate cuts to max characters" -m "Plan-task: 1"
awk '/^Step 2:/{f=1;next} f&&/^```js/{g=1;next} g&&/^```$/{exit} g' docs/plans/text-truncate.md > src/truncate.js
git add -A
git commit -q -m "feat(text): add truncate" -m "Plan-task: 1"

cat > "$root/report-trunc/implementer-1.md" <<'J'
Landed: Added `truncate` helper module and its test
Test first: yes, risky (new behavior, plan specifies red-before-green)
Red: `node --test src/truncate.test.js`: fail, ERR_MODULE_NOT_FOUND naming truncate.js
  Module './truncate.js' did not exist yet
Proof:
node --test src/truncate.test.js: pass
  pass 1
  fail 0
Unresolved: none
J

npm test >/dev/null
echo "review-branch fixture ready: $root/fx-trunc"
