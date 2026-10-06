import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteTotal } from '../src/quote.mjs';
import { mug, order, pen } from './fixtures.mjs';

test('quote rounds up', () => {
  assert.equal(quoteTotal({ ...order, items: [mug(1), pen(2)] }), 2379);
});

test('quote refuses an empty cart', () => {
  assert.throws(
    () => quoteTotal({ ...order, items: [] }),
    { name: 'QuoteError', message: /empty cart/ },
  );
});

test('quote rejects an expired coupon', () => {
  assert.throws(
    () => quoteTotal({ ...order, coupon: 'SPRING5' }),
    { name: 'CouponError', message: /SPRING5 expired/ },
  );
});
