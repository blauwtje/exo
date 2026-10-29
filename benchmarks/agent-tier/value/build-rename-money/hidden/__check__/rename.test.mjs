import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as money from '../src/money.mjs';
import { invoiceLine } from '../src/invoice.mjs';
import { receiptTotal } from '../src/receipt.mjs';

const root = path.resolve(import.meta.dirname, '..');
const OLD = ['fmt', 'Money'].join('');

function sources(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? sources(full) : [full];
  });
}

function filesMentioningOldName() {
  const files = [...sources(path.join(root, 'src')), ...sources(path.join(root, 'test')), path.join(root, 'README.md')];
  return files.filter((file) => readFileSync(file, 'utf8').includes(OLD)).map((file) => path.relative(root, file));
}

test('formatMoney is exported and formats cents', () => {
  assert.equal(money.formatMoney(1999), '19.99 USD');
  assert.equal(money.formatMoney(5, 'EUR'), '0.05 EUR');
});

test('the old export is gone', () => {
  assert.equal(OLD in money, false);
});

test('invoiceLine still works', () => {
  assert.equal(invoiceLine({ name: 'pen', quantity: 2, cents: 150, currency: 'EUR' }), 'pen x2: 3.00 EUR');
});

test('receiptTotal still works', () => {
  assert.equal(receiptTotal([{ cents: 250, quantity: 2 }], 'USD'), 'Total: 5.00 USD');
});

test('no source, test or doc mentions the old name', () => {
  assert.deepEqual(filesMentioningOldName(), []);
});
