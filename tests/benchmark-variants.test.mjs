import assert from 'node:assert/strict';
import test from 'node:test';

import { sweepCells } from '../benchmarks/sweep-cells.mjs';
import { VARIANTS } from '../benchmarks/variants.mjs';

test('the flow cells hold no second arm of the shipped build shape', () => {
  const ids = sweepCells().map((cell) => cell.id);
  assert.ok(ids.includes('flow-unit'));
  assert.equal(ids.includes('flow-nofork'), false);
  assert.equal('no-fork-build' in VARIANTS, false);
});
