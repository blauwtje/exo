import assert from 'node:assert/strict';
import test from 'node:test';
import { mean } from '../src/mean.mjs';

test('mean divides the sum by the count', () => {
  assert.equal(mean([2, 4, 9]), 5);
  assert.equal(mean([]), 0);
});
