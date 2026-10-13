import assert from 'node:assert/strict';
import { test } from 'node:test';
import { equalsLandGate } from '#land-gate';

test('equalsLandGate ignores backticks and surrounding spaces', () => {
  assert.equal(equalsLandGate('npm run check', '`npm run check`'), true);
  assert.equal(equalsLandGate('npm run check', ' npm run check '), true);
});

test('equalsLandGate is false for another command or a missing gate', () => {
  assert.equal(equalsLandGate('npm run check', 'npm test'), false);
  assert.equal(equalsLandGate('npm run check', undefined), false);
  assert.equal(equalsLandGate(undefined, 'npm run check'), false);
});
