import assert from 'node:assert/strict';
import test from 'node:test';
import { totalOf } from '../src/totals.mjs';

test('totalOf sums the non-blank lines', () => {
  assert.equal(totalOf(['1', ' ', '2.5']), 3.5);
});
