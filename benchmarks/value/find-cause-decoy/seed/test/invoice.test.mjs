import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceTotal } from '../src/invoice.mjs';
import { order } from './fixtures.mjs';

test('invoice adds tax to the subtotal', () => {
  assert.equal(invoiceTotal(order), 4379);
});

test('invoice takes the coupon off before tax', () => {
  assert.equal(invoiceTotal({ ...order, coupon: 'SAVE10' }), 3940);
});

test('invoice rejects an expired coupon', () => {
  assert.throws(
    () => invoiceTotal({ ...order, coupon: 'SPRING5' }),
    { name: 'CouponError', message: /expired/ },
  );
});

test('invoice rejects an unknown coupon', () => {
  assert.throws(
    () => invoiceTotal({ ...order, coupon: 'NOPE' }),
    { name: 'CouponError', message: /unknown coupon NOPE/ },
  );
});
