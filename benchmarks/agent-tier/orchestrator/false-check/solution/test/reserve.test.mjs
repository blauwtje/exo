import assert from 'node:assert/strict';
import test from 'node:test';
import { reserve } from '../src/stock.mjs';

test('reserve refuses a quantity above the stock', () => {
  assert.throws(() => reserve({ a: 5 }, 'a', 6), RangeError);
  assert.throws(() => reserve({ a: 5 }, 'b', 1), RangeError);
});

test('reserve may take the whole stock and leaves its input alone', () => {
  const stock = { a: 5 };
  assert.deepEqual(reserve(stock, 'a', 5), { a: 0 });
  assert.deepEqual(stock, { a: 5 });
});
