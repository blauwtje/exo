#!/usr/bin/env bash
set -euo pipefail

workdir="$PWD"
mkdir -p "$workdir/src" "$workdir/test" "$workdir/data"

cat > "$workdir/package.json" <<'JSON'
{
  "name": "shelf",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "test": "node --test" }
}
JSON

cat > "$workdir/data/loans.json" <<'JSON'
[
  { "id": 1, "member": "ana", "title": "Dune", "borrowed": "2026-10-01", "due": "2026-10-15", "returned": null },
  { "id": 2, "member": "ben", "title": "Emma", "borrowed": "2026-10-10", "due": "2026-10-24", "returned": "2026-10-30" },
  { "id": 3, "member": "ana", "title": "Ulysses", "borrowed": "2026-11-01", "due": "2026-11-15", "returned": null }
]
JSON

cat > "$workdir/src/money.js" <<'JS'
export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const whole = Math.trunc(Math.abs(cents) / 100);
  const fraction = String(Math.abs(cents) % 100).padStart(2, '0');
  return `${sign}${whole},${fraction} EUR`;
}
JS

cat > "$workdir/src/csv.js" <<'JS'
const DELIMITER = ';';

function escapeField(value) {
  const text = String(value);
  return text.includes(DELIMITER) || text.includes('"') ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(header, rows) {
  return [header, ...rows].map((row) => row.map(escapeField).join(DELIMITER)).join('\r\n') + '\r\n';
}
JS

cat > "$workdir/src/loans.js" <<'JS'
import { readFileSync } from 'node:fs';

const DAY_MS = 24 * 60 * 60 * 1000;

export function loadLoans(file = new URL('../data/loans.json', import.meta.url)) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function daysBetween(from, to) {
  return Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
}

export function daysLate(loan, today) {
  const end = loan.returned ?? today;
  return Math.max(0, daysBetween(loan.due, end));
}

export function overdueLoans(loans, today) {
  return loans.filter((loan) => daysLate(loan, today) > 0);
}
JS

cat > "$workdir/src/cli.js" <<'JS'
import { loadLoans, overdueLoans, daysLate } from './loans.js';

const [command, ...args] = process.argv.slice(2);
const today = args[0] ?? new Date().toISOString().slice(0, 10);

if (command === 'overdue') {
  for (const loan of overdueLoans(loadLoans(), today)) {
    console.log(`${loan.member}\t${loan.title}\t${daysLate(loan, today)} days late`);
  }
} else {
  console.error('usage: node src/cli.js overdue [YYYY-MM-DD]');
  process.exitCode = 1;
}
JS

cat > "$workdir/test/loans.test.js" <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysLate, overdueLoans } from '../src/loans.js';

const open = { due: '2026-10-15', returned: null };
const closed = { due: '2026-10-24', returned: '2026-10-30' };

test('an open loan counts days until today', () => {
  assert.equal(daysLate(open, '2026-10-20'), 5);
});

test('a returned loan counts days until its return', () => {
  assert.equal(daysLate(closed, '2026-12-01'), 6);
});

test('overdueLoans keeps only late loans', () => {
  assert.deepEqual(overdueLoans([open, closed, { due: '2026-12-01', returned: null }], '2026-10-20'), [open, closed]);
});
JS

cat > "$workdir/test/csv.test.js" <<'JS'
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../src/csv.js';

test('toCsv quotes a field that holds the delimiter', () => {
  assert.equal(toCsv(['a', 'b'], [['x;y', 'z']]), 'a;b\r\n"x;y";z\r\n');
});
JS

git init -q "$workdir"
git -C "$workdir" add -A
git -C "$workdir" -c user.name=Jane -c user.email=jane@example.com commit -q -m "feat(shelf): add the loan list"
