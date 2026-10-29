import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceLine } from '../src/invoice.mjs';
import { formatMoney } from '../src/money.mjs';
import { receiptTotal } from '../src/receipt.mjs';

test('formatMoney formats cents', () => {
  assert.equal(formatMoney(1999), '19.99 USD');
});

test('invoiceLine multiplies by quantity', () => {
  assert.equal(invoiceLine({ name: 'pen', quantity: 3, cents: 150, currency: 'EUR' }), 'pen x3: 4.50 EUR');
});

test('receiptTotal sums items', () => {
  assert.equal(receiptTotal([{ cents: 100, quantity: 2 }, { cents: 50, quantity: 1 }], 'USD'), 'Total: 2.50 USD');
});
