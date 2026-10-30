import assert from 'node:assert/strict';
import test from 'node:test';
import { toKg } from '../src/units.mjs';

test('toKg converts pounds', () => {
  assert.ok(Math.abs(toKg(10) - 4.5359237) < 1e-9);
});
