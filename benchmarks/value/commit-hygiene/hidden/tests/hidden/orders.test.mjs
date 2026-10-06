import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listOrders } from '../../src/orders.mjs';

test('all 47 orders need five pages of ten', () => {
  assert.equal(listOrders().totalPages, 5);
  assert.equal(listOrders({ page: 4 }).hasNext, true);
});

test('the last page of all orders holds seven entries and no next page', () => {
  const result = listOrders({ page: 5 });
  assert.equal(result.items.length, 7);
  assert.equal(result.hasNext, false);
});

test('open orders page by five into four pages', () => {
  const third = listOrders({ status: 'open', page: 3, pageSize: 5 });
  assert.equal(third.totalPages, 4);
  assert.equal(third.hasNext, true);
  const fourth = listOrders({ status: 'open', page: 4, pageSize: 5 });
  assert.equal(fourth.items.length, 1);
  assert.equal(fourth.hasNext, false);
});
