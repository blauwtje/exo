import assert from 'node:assert/strict';
import test from 'node:test';
import { fulfil } from '../src/fulfil.mjs';

test('fulfil reserves what it can and lists the skus it could not', () => {
  const order = [{ sku: 'a', qty: 2 }, { sku: 'b', qty: 3 }, { sku: 'a', qty: 3 }];
  assert.deepEqual(fulfil({ a: 5, b: 1 }, order), { stock: { a: 0, b: 1 }, short: ['b'] });
});
