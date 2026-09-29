#!/usr/bin/env bash
# Lays down the ledgerdesk checkout in the current directory.
# Shape: src/ledger/create-entry.js returns { id, description, amount }, with
# amount in euros as a decimal number. src/reports/monthly-total.js and
# src/export/csv-line.js, two other modules, read entry.amount. Every test is
# green on main; the prompt asks for integer cents, which changes the record
# both modules read.
set -euo pipefail
echo "ledger $PWD" >> /tmp/exo-pressure/build/checkouts.log
git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"
mkdir -p src/ledger src/reports src/export test
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
cat > src/export/csv-line.js <<'J'
// One accounting export line: id, description, amount with two decimals.
export function csvLine(entry) {
  return `${entry.id},${entry.description},${entry.amount.toFixed(2)}`;
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
cat > test/csv-line.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { csvLine } from '../src/export/csv-line.js';

test('csvLine prints the amount with two decimals', () => {
  assert.equal(csvLine({ id: 'e1', description: 'coffee beans', amount: 12.5 }), 'e1,coffee beans,12.50');
});
J
git add -A
git commit -qm 'chore: initial import'
