import assert from 'node:assert/strict';
import test from 'node:test';
import { processOrders } from '../src/batch.mjs';
import { mug, order, pen } from './fixtures.mjs';

test('an unknown order type is reported', () => {
  const [result] = processOrders([{ id: 't4', type: 'swap' }]);
  assert.deepEqual(result, { id: 't4', type: 'swap', error: 'unknown order type swap' });
});

test('fee entries are priced', () => {
  const results = processOrders([
    { id: 't5', type: 'shipping', items: order.items },
    { id: 't6', type: 'late-fee', invoiceCents: 10000, daysLate: 45 },
  ]);
  assert.deepEqual(results.map((r) => r.cents), [142, 300]);
});

test('a failing order is reported and the run goes on', () => {
  const results = processOrders([
    { id: 't1', type: 'invoice', ...order },
    { id: 't2', type: 'refund', order, returns: [{ sku: 'MUG-01', qty: 9 }] },
    { id: 't3', type: 'quote', ...order, items: [mug(1), pen(2)] },
  ]);
  assert.deepEqual(results, [
    { id: 't1', type: 'invoice', cents: 4379 },
    { id: 't2', type: 'refund', error: 'cannot refund 9 of MUG-01, only 2 were bought' },
    { id: 't3', type: 'quote', cents: 2379 },
  ]);
});
