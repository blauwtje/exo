#!/usr/bin/env bash
# Builds the compression fixture under /tmp/exo-pressure/compression/:
# ledger, a one-commit Node checkout whose `npm test` prints over 2,000 lines,
# so a run that calls it a few times reads mostly test output.
# Bug: toCents floors amount * 100, so an amount such as 0.29 or 1.15 loses a
# cent to floating point; a few of the 600 tests fail on it. The fix is
# Math.round in src/money.js; the tests stay as they are.
set -euo pipefail

root=/tmp/exo-pressure/compression
rm -rf "$root"
mkdir -p "$root/ledger/src" "$root/ledger/test"
cd "$root/ledger"

git init -q -b main
git config user.name "Fixture Author"
git config user.email "fixture@example.com"

cat > package.json <<'J'
{ "name": "ledger", "private": true, "type": "module", "scripts": { "test": "node --test --test-reporter=tap test/*.test.js" } }
J
printf 'node_modules/\n.exo/\n' > .gitignore

cat > src/money.js <<'J'
// Amounts arrive as decimal numbers of euros; the ledger stores whole cents.
export function toCents(amount) {
  return Math.floor(amount * 100);
}

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const whole = Math.abs(cents);
  return `${sign}€${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`;
}

export function total(amounts) {
  return amounts.reduce((sum, amount) => sum + toCents(amount), 0);
}
J

cat > test/to-cents.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { toCents } from '../src/money.js';

for (let cents = 0; cents < 300; cents += 1) {
  const amount = Number((cents / 100).toFixed(2));
  test(`toCents(${amount}) is ${cents}`, () => {
    assert.equal(toCents(amount), cents);
  });
}
J

cat > test/format.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCents } from '../src/money.js';

for (let cents = -100; cents < 200; cents += 1) {
  const whole = Math.abs(cents);
  const expected = `${cents < 0 ? '-' : ''}€${Math.floor(whole / 100)}.${String(whole % 100).padStart(2, '0')}`;
  test(`formatCents(${cents}) is ${expected}`, () => {
    assert.equal(formatCents(cents), expected);
  });
}
J

git add -A
git commit -q -m "feat(ledger): add money helpers"
echo "compression fixture ready: $root/ledger"
