import assert from 'node:assert/strict';
import test from 'node:test';
import { label, lbLabel } from '../src/label.mjs';

test('label prints kilograms', () => {
  assert.equal(label(10), '4.54 kg');
});

test('lbLabel prints pounds', () => {
  assert.equal(lbLabel(4.5359237), '10.0 lb');
});
