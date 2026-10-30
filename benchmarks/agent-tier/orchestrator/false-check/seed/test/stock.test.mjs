import assert from 'node:assert/strict';
import test from 'node:test';
import { reserve } from '../src/stock.mjs';

test('reserve takes the quantity from the stock', () => {
  assert.deepEqual(reserve({ a: 5 }, 'a', 2), { a: 3 });
});
