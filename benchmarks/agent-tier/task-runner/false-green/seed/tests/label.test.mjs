import assert from 'node:assert/strict';
import test from 'node:test';
import { label } from '../src/label.mjs';

test('label prints kilograms', () => {
  assert.equal(label(10), '4.54 kg');
});
