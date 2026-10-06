import assert from 'node:assert/strict';
import test from 'node:test';
import { refundTotal } from '../src/refund.mjs';
import { mug, order } from './fixtures.mjs';

test('refund rounds down', () => {
  assert.equal(refundTotal(order, [{ sku: 'MUG-01', qty: 1 }]), 1622);
});

test('refund covers several returned lines', () => {
  const returns = [{ sku: 'MUG-01', qty: 2 }, { sku: 'PEN-04', qty: 3 }];
  assert.equal(refundTotal(order, returns), 4378);
});

test('refund refuses to return more than was bought', () => {
  assert.throws(
    () => refundTotal(order, [{ sku: 'MUG-01', qty: 3 }]),
    { name: 'RefundError', message: /cannot refund 3 of MUG-01, only 2 were bought/ },
  );
});

test('refund refuses a sku that was not on the order', () => {
  assert.throws(
    () => refundTotal({ ...order, items: [mug(1)] }, [{ sku: 'PEN-04', qty: 1 }]),
    { name: 'RefundError', message: /PEN-04 was not on the order/ },
  );
});
