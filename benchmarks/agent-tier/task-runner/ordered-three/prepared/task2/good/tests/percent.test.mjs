import assert from 'node:assert/strict';
import test from 'node:test';
import { percent } from '../src/percent.mjs';

test('percent rounds and clamps', () => {
  assert.equal(percent(1, 4), 25);
  assert.equal(percent(9, 4), 100);
  assert.equal(percent(1, 0), 0);
});
