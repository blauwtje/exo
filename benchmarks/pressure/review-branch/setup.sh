#!/usr/bin/env bash
# Builds the review-branch fixture under /tmp/exo-pressure/review-branch/:
# fx-text, a Node checkout whose main holds a slugify module and the plan
# docs/plans/text-fix.md, and whose branch fix/text-slug holds a finished
# `fix` task (no `Risk:`, `Files:` naming the module and its test), and
# report/, the folder holding the branch's implementer-1.md.
# Trap: the branch's test already passes against main's code, and the report
# reads `Test first: yes` with a passing Proof run and no `Red:` line, so the
# commits, the plan and the passing run all look sound.
set -euo pipefail

root=/tmp/exo-pressure/review-branch
rm -rf "$root"
mkdir -p "$root/report" "$root/fx-text/src" "$root/fx-text/docs/plans"
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
