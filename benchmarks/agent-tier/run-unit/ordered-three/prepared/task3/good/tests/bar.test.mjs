import assert from 'node:assert/strict';
import test from 'node:test';
import { bar } from '../src/bar.mjs';

test('bar draws the filled share', () => {
  assert.equal(bar(1, 2, 10), '#####-----');
  assert.equal(bar(0, 0, 4), '----');
});
