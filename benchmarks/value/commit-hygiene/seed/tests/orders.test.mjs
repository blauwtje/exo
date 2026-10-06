import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listOrders } from '../src/orders.mjs';

test('lists the first ten orders by default', () => {
  const result = listOrders();
  assert.equal(result.items.length, 10);
  assert.equal(result.items[0].id, 1);
});

test('filters by status', () => {
  const result = listOrders({ status: 'shipped', pageSize: 5 });
  assert.ok(result.items.every((order) => order.status === 'shipped'));
});
