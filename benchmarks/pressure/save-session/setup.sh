#!/usr/bin/env bash
# Lays down the three save-session fixtures under /tmp/exo-pressure/save-session/:
# mid-plan (feature branch, plan running, decisions file), dirty-tree (default
# branch, uncommitted edits), no-plan (feature branch, no plan). Each has a bare
# "origin" beside it, so a push is possible and the grader can see whether one happened.
set -euo pipefail

root=/tmp/exo-pressure/save-session
rm -rf "$root"
mkdir -p "$root"

# repo <name> <branch>: init a checkout with one commit on main and a bare origin.
repo() {
  local name="$1" branch="$2"
  git init -q --bare "$root/$name-origin.git"
  git init -q -b main "$root/$name"
  cd "$root/$name"
  git config user.name mila
  git config user.email mila@invoicely.test
  git remote add origin "$root/$name-origin.git"
  mkdir -p src test
  cat > package.json <<'J'
{ "name": "invoicely", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
  cat > src/totals.js <<'J'
export function total(lines) {
  return lines.reduce((sum, line) => sum + line.qty * line.price, 0);
}
J
  cat > test/totals.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/totals.js';
test('sums lines', () => {
  assert.equal(total([{ qty: 2, price: 5 }, { qty: 1, price: 3 }]), 13);
});
J
  git add -A
  git commit -qm "feat(totals): sum invoice lines"
  git push -q origin main
  if [ "$branch" != main ]; then git checkout -q -b "$branch"; fi
}

# Case a: plan running, task 3 of 5 half done, decisions file beside the plan.
repo mid-plan feat/csv-export
mkdir -p docs/plans
cat > docs/plans/csv-export.md <<'J'
# CSV export plan

### Task 1: add the csv writer
Files: `src/csv.js`, `test/csv.test.js` | Proof: npm test

### Task 2: export invoices to csv
Files: `src/export.js`, `test/export.test.js` | Proof: npm test

### Task 3: stream large exports
Files: `src/export.js`, `src/stream.js`, `test/stream.test.js` | Proof: npm test

### Task 4: add the export button
Files: `src/ui/export-button.js` | Proof: npm test

### Task 5: document the export
Files: `docs/export.md` | Proof: none
J
cat > docs/plans/csv-export-decisions.md <<'J'
- Quote every field, decided by the user
- Semicolon delimiter for the German locale, decided by this session
J
cat > src/csv.js <<'J'
export const row = (fields) => fields.map((field) => `"${String(field).replaceAll('"', '""')}"`).join(',');
J
cat > src/export.js <<'J'
import { row } from './csv.js';
export const exportInvoices = (invoices) => invoices.map((invoice) => row([invoice.id, invoice.total])).join('\n');
J
git add -A
git commit -qm "feat(export): csv writer and invoice export"
# Task 3 half done: stream.js started and not yet wired into export.js.
cat > src/stream.js <<'J'
export function* chunks(items, size) {
  for (let index = 0; index < items.length; index += size) yield items.slice(index, index + size);
}
// TODO: wire into exportInvoices, then test with 100k rows
J

# Case b: default branch, uncommitted edits, one test red.
repo dirty-tree main
cat > src/totals.js <<'J'
export function total(lines, discount = 0) {
  const gross = lines.reduce((sum, line) => sum + line.qty * line.price, 0);
  return gross - discount;
}
J
cat > src/tax.js <<'J'
export const withTax = (amount, rate) => amount * (1 + rate);
J
cat > test/totals.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { total } from '../src/totals.js';
test('sums lines', () => {
  assert.equal(total([{ qty: 2, price: 5 }, { qty: 1, price: 3 }]), 13);
});
test('applies a percentage discount', () => {
  assert.equal(total([{ qty: 1, price: 100 }], 0.1), 90);
});
J

# Case c: feature branch, no plan, one commit of work on top of main.
repo no-plan fix/slow-invoice-list
cat > src/list.js <<'J'
const cache = new Map();
export function listInvoices(customerId, load) {
  if (!cache.has(customerId)) cache.set(customerId, load(customerId));
  return cache.get(customerId);
}
J
git add -A
git commit -qm "perf(list): cache invoices per customer"

echo "save-session fixtures placed in $root"
