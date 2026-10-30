import assert from 'node:assert/strict';
import test from 'node:test';
import { clamp } from '../src/clamp.mjs';

test('clamp bounds a value', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});
