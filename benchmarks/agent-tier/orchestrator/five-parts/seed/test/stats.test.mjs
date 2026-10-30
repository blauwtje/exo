import assert from 'node:assert/strict';
import test from 'node:test';
import { mean } from '../src/stats.mjs';

test('mean averages the values', () => {
  assert.equal(mean([1, 2, 3]), 2);
});
