import assert from 'node:assert/strict';
import test from 'node:test';
import { format } from '../src/money.mjs';
import { invoice, splitTotal } from '../src/pricing.mjs';

test('format shows two decimals', () => {
  assert.equal(format(12), '12.00');
  assert.equal(format(3.5), '3.50');
});

test('invoice adds up a plain order', () => {
  const result = invoice([{ price: 10, qty: 2 }, { price: 5.5, qty: 1 }], { discountPercent: 10, vatPercent: 20 });
  assert.deepEqual(result, { subtotal: '25.50', discount: '2.55', vat: '4.59', total: '27.54' });
});

test('splitTotal divides an even amount', () => {
  assert.deepEqual(splitTotal(10, 2), ['5.00', '5.00']);
});
