import assert from 'node:assert/strict';
import { test } from 'node:test';
import { allocateCents } from '../src/money.ts';

test('allocateCents gives the leftover cents to the largest remainders', () => {
  assert.deepEqual(allocateCents(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(allocateCents(1000, [2500, 7500]), [250, 750]);
  assert.deepEqual(allocateCents(10, [1, 2, 3]), [2, 3, 5]);
});

test('allocateCents splits evenly over all-zero weights', () => {
  assert.deepEqual(allocateCents(5, [0, 0]), [3, 2]);
});

test('allocateCents refuses no weights or a negative weight', () => {
  assert.throws(() => allocateCents(5, []), RangeError);
  assert.throws(() => allocateCents(5, [1, -1]), RangeError);
});
