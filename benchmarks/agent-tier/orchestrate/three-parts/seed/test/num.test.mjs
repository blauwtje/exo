import assert from 'node:assert/strict';
import test from 'node:test';
import { sum } from '../src/num.mjs';

test('sum adds the values', () => {
  assert.equal(sum([1, 2, 3]), 6);
});
