import assert from 'node:assert/strict';
import test from 'node:test';
import { handle } from '../src/api.mjs';
import { order } from './fixtures.mjs';

test('invoice request', () => {
  assert.deepEqual(handle({ type: 'invoice', order }), {
    status: 200,
    body: { totalCents: 4379 },
  });
});

test('refund request', () => {
  const response = handle({ type: 'refund', order, returns: [{ sku: 'MUG-01', qty: 1 }] });
  assert.deepEqual(response, { status: 200, body: { totalCents: 1622 } });
});

test('shipping request', () => {
  assert.deepEqual(handle({ type: 'shipping', order }), {
    status: 200,
    body: { totalCents: 142 },
  });
});

test('unknown request type is a 400', () => {
  assert.equal(handle({ type: 'gift-wrap', order }).status, 400);
});

test('a rejected quote is a 422 with the reason', () => {
  const response = handle({ type: 'quote', order: { ...order, coupon: 'SPRING5' } });
  assert.equal(response.status, 422);
  assert.match(response.body.error, /SPRING5 expired/);
});
