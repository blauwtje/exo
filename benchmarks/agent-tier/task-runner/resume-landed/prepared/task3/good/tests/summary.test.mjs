import assert from 'node:assert/strict';
import test from 'node:test';
import { summary } from '../src/summary.mjs';

test('summary holds span and mean', () => {
  assert.deepEqual(summary([2, 4, 9]), { span: 7, mean: 5 });
});
