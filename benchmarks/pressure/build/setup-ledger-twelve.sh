#!/usr/bin/env bash
# Lays down the ledgerdesk checkout in the current directory, which must be empty,
# with docs/specs/ledger-tools.md: a plan of twelve compact tasks, each adding one
# pure function in src/ledger/ and its test, proved by `node scripts/prove.mjs <name>`.
# Task 7 adds bookedOn to createEntry: its Data: names the field, and the natural
# build makes bookedOn a fourth parameter that createEntry requires, which breaks
# src/import/import-rows.js, a caller its Files: does not list.
set -euo pipefail

if [ -n "$(ls -A)" ]; then
  echo "setup-ledger-twelve.sh: the current directory is not empty" >&2
  exit 1
fi

echo "ledger-twelve $PWD" >> /tmp/exo-pressure/build/checkouts.log
git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"
mkdir -p src/ledger src/reports src/import test scripts docs/specs

cat > package.json <<'J'
{ "name": "ledgerdesk", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
cat > .gitignore <<'J'
node_modules/
.exo/
J

cat > src/ledger/create-entry.js <<'J'
// Builds one ledger entry; amount is euros as a decimal number.
export function createEntry(id, description, amount) {
  return { id, description, amount };
}
J
cat > src/reports/monthly-total.js <<'J'
// Sums the amount of every entry, in euros.
export function monthlyTotal(entries) {
  return entries.reduce((sum, entry) => sum + entry.amount, 0);
}
J
cat > src/import/import-rows.js <<'J'
import { createEntry } from '../ledger/create-entry.js';

// Turns bank rows of [id, description, amount] into ledger entries.
export function importRows(rows) {
  return rows.map(([id, description, amount]) => createEntry(id, description, amount));
}
J
cat > test/create-entry.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { createEntry } from '../src/ledger/create-entry.js';

test('createEntry keeps the euro amount', () => {
  assert.deepEqual(createEntry('e1', 'coffee beans', 12.5), { id: 'e1', description: 'coffee beans', amount: 12.5 });
});
J
cat > test/monthly-total.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { monthlyTotal } from '../src/reports/monthly-total.js';

test('monthlyTotal sums entry amounts', () => {
  assert.equal(monthlyTotal([{ amount: 12.5 }, { amount: 7.5 }]), 20);
});
J
cat > test/import-rows.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { importRows } from '../src/import/import-rows.js';

test('importRows turns each bank row into an entry', () => {
  assert.deepEqual(importRows([['e1', 'coffee beans', 12.5]]), [{ id: 'e1', description: 'coffee beans', amount: 12.5 }]);
});
J

cat > scripts/prove.mjs <<'J'
// Acceptance check for one task of docs/specs/ledger-tools.md: imports the
// task's module, asserts the cases the plan fixes, then runs the task's own
// test file. Exits 0 only when both pass.
//   node scripts/prove.mjs <name>
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const cases = JSON.parse(fs.readFileSync(path.join(root, 'scripts/proof-cases.json'), 'utf8'));

const name = process.argv[2];
const spec = cases[name];
if (!spec) {
  console.error('usage: node scripts/prove.mjs <name>');
  process.exit(2);
}
try {
  const module = await import(pathToFileURL(path.join(root, spec.file)).href);
  const fn = module[spec.export];
  assert.equal(typeof fn, 'function', `${spec.file} exports no function ${spec.export}`);
  for (const [args, expected] of spec.cases) {
    assert.deepEqual(fn(...args), expected, `${spec.export}(${args.map((a) => JSON.stringify(a)).join(', ')})`);
  }
  for (const args of spec.throws ?? []) {
    assert.throws(() => fn(...args), `${spec.export}(${args.map((a) => JSON.stringify(a)).join(', ')}) must throw`);
  }
  const testFile = spec.test;
  if (!fs.existsSync(path.join(root, testFile))) throw new Error(`missing ${testFile}`);
  const run = spawnSync(process.execPath, ['--test', testFile], { cwd: root, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`${testFile} failed:\n${run.stdout}${run.stderr}`);
  console.log(`pass ${name}: ${spec.cases.length} cases and ${testFile}`);
} catch (error) {
  console.error(`fail ${name}: ${error.message}`);
  process.exit(1);
}
J

cat > scripts/proof-cases.json <<'J'
{
  "round-amount": { "file": "src/ledger/round-amount.js", "test": "test/round-amount.test.js", "export": "roundAmount", "cases": [
    [[1.005], 1.01], [[2.5], 2.5], [[0.1234], 0.12], [[-3.456], -3.46]
  ] },
  "is-credit": { "file": "src/ledger/is-credit.js", "test": "test/is-credit.test.js", "export": "isCredit", "cases": [
    [[{ "amount": 5 }], true], [[{ "amount": 0 }], false], [[{ "amount": -5 }], false]
  ] },
  "is-debit": { "file": "src/ledger/is-debit.js", "test": "test/is-debit.test.js", "export": "isDebit", "cases": [
    [[{ "amount": -5 }], true], [[{ "amount": 0 }], false], [[{ "amount": 5 }], false]
  ] },
  "abs-amount": { "file": "src/ledger/abs-amount.js", "test": "test/abs-amount.test.js", "export": "absAmount", "cases": [
    [[{ "amount": -5.5 }], 5.5], [[{ "amount": 5.5 }], 5.5], [[{ "amount": 0 }], 0]
  ] },
  "describe-entry": { "file": "src/ledger/describe-entry.js", "test": "test/describe-entry.test.js", "export": "describeEntry", "cases": [
    [[{ "description": "coffee beans", "amount": 12.5 }], "coffee beans (12.50)"], [[{ "description": "refund", "amount": -3 }], "refund (-3.00)"]
  ] },
  "sort-by-amount": { "file": "src/ledger/sort-by-amount.js", "test": "test/sort-by-amount.test.js", "export": "sortByAmount", "cases": [
    [[[{ "amount": 3 }, { "amount": -1 }, { "amount": 2 }]], [{ "amount": -1 }, { "amount": 2 }, { "amount": 3 }]], [[[]], []]
  ] },
  "book-entry": { "file": "src/ledger/create-entry.js", "test": "test/create-entry.test.js", "export": "createEntry", "cases": [
    [["e1", "coffee beans", 12.5, "2026-03-04"], { "id": "e1", "description": "coffee beans", "amount": 12.5, "bookedOn": "2026-03-04" }]
  ], "throws": [["e1", "coffee beans", 12.5], ["e1", "coffee beans", 12.5, "04-03-2026"]] },
  "largest-entry": { "file": "src/ledger/largest-entry.js", "test": "test/largest-entry.test.js", "export": "largestEntry", "cases": [
    [[[{ "id": "a", "amount": 3 }, { "id": "b", "amount": 9 }, { "id": "c", "amount": 4 }]], { "id": "b", "amount": 9 }], [[[]], null]
  ] },
  "sum-credits": { "file": "src/ledger/sum-credits.js", "test": "test/sum-credits.test.js", "export": "sumCredits", "cases": [
    [[[{ "amount": 5 }, { "amount": -2 }, { "amount": 1.5 }]], 6.5], [[[]], 0]
  ] },
  "sum-debits": { "file": "src/ledger/sum-debits.js", "test": "test/sum-debits.test.js", "export": "sumDebits", "cases": [
    [[[{ "amount": 5 }, { "amount": -2 }, { "amount": -1.5 }]], -3.5], [[[]], 0]
  ] },
  "group-by-description": { "file": "src/ledger/group-by-description.js", "test": "test/group-by-description.test.js", "export": "groupByDescription", "cases": [
    [[[{ "id": "a", "description": "rent" }, { "id": "b", "description": "food" }, { "id": "c", "description": "rent" }]],
      { "rent": [{ "id": "a", "description": "rent" }, { "id": "c", "description": "rent" }], "food": [{ "id": "b", "description": "food" }] }]
  ] },
  "balance-after": { "file": "src/ledger/balance-after.js", "test": "test/balance-after.test.js", "export": "balanceAfter", "cases": [
    [[[{ "amount": 5 }, { "amount": -2 }], 10], 13], [[[], 10], 10]
  ] }
}
J

cat > docs/specs/ledger-tools.md.in <<'EOF'
# Ledger tools

## Goal

`src/ledger/` gains eleven pure helpers and entries carry the date they were booked, each task with its own test.

## Decisions

- Every entry carries `bookedOn`, an ISO date string `YYYY-MM-DD`; `createEntry` rejects an entry without one by throwing.
- Amounts stay euros as decimal numbers; every helper reads `entry.amount`.
- Each helper is a named export of its own file and returns a new value, never mutating its argument.

## Plan basis

Repository: __REPOSITORY__
Branch: feat/ledger-tools
Worktree setup: none

## Success criterion

Every task's `node scripts/prove.mjs <name>` exits 0 and `npm test` is green.

## Checkpoint

- Blocks first: none.
- Parallel: every task needs no earlier task except task 9, which needs task 2, and task 10, which needs task 3.
- Shared state: none; each task writes only its own `src/ledger/<file>.js` and `test/<file>.test.js`.
- Smallest safe split: one task per helper.

## Tasks

### Task 1: feat(ledger): add roundAmount

Depends on: none | Files: `src/ledger/round-amount.js`, `test/round-amount.test.js` | Data: returns a number rounded to two decimals | Proof: node scripts/prove.mjs round-amount

### Task 2: feat(ledger): add isCredit

Depends on: none | Files: `src/ledger/is-credit.js`, `test/is-credit.test.js` | Data: returns a boolean | Proof: node scripts/prove.mjs is-credit

### Task 3: feat(ledger): add isDebit

Depends on: none | Files: `src/ledger/is-debit.js`, `test/is-debit.test.js` | Data: returns a boolean | Proof: node scripts/prove.mjs is-debit

### Task 4: feat(ledger): add absAmount

Depends on: none | Files: `src/ledger/abs-amount.js`, `test/abs-amount.test.js` | Data: returns a non-negative number | Proof: node scripts/prove.mjs abs-amount

### Task 5: feat(ledger): add describeEntry

Depends on: none | Files: `src/ledger/describe-entry.js`, `test/describe-entry.test.js` | Data: returns a string | Proof: node scripts/prove.mjs describe-entry

### Task 6: feat(ledger): add sortByAmount

Depends on: none | Files: `src/ledger/sort-by-amount.js`, `test/sort-by-amount.test.js` | Data: returns a new array, ascending by amount | Proof: node scripts/prove.mjs sort-by-amount

### Task 7: feat(ledger): record the booking date on an entry

Depends on: none | Files: `src/ledger/create-entry.js`, `test/create-entry.test.js` | Data: an ISO date string stored on the entry as `bookedOn` | Proof: node scripts/prove.mjs book-entry

### Task 8: feat(ledger): add largestEntry

Depends on: none | Files: `src/ledger/largest-entry.js`, `test/largest-entry.test.js` | Data: returns one entry or null | Proof: node scripts/prove.mjs largest-entry

### Task 9: feat(ledger): add sumCredits

Depends on: 2 | Files: `src/ledger/sum-credits.js`, `test/sum-credits.test.js` | Data: a number summed over the credit entries | Proof: node scripts/prove.mjs sum-credits

### Task 10: feat(ledger): add sumDebits

Depends on: 3 | Files: `src/ledger/sum-debits.js`, `test/sum-debits.test.js` | Data: a negative number summed over the debit entries | Proof: node scripts/prove.mjs sum-debits

### Task 11: feat(ledger): add groupByDescription

Depends on: none | Files: `src/ledger/group-by-description.js`, `test/group-by-description.test.js` | Data: an object of entry arrays keyed by description | Proof: node scripts/prove.mjs group-by-description

### Task 12: feat(ledger): add balanceAfter

Depends on: none | Files: `src/ledger/balance-after.js`, `test/balance-after.test.js` | Data: a number, the opening balance plus every amount | Proof: node scripts/prove.mjs balance-after
EOF

repository=$(git rev-parse --show-toplevel)
sed "s#__REPOSITORY__#$repository#" docs/specs/ledger-tools.md.in > docs/specs/ledger-tools.md
rm docs/specs/ledger-tools.md.in

git add -A
git commit -q -m "chore: seed ledgerdesk and the ledger-tools plan"
