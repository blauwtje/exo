import assert from 'node:assert/strict';
import test from 'node:test';

import { sweepCells, pluginVariants } from '../benchmarks/sweep-cells.mjs';
import { VARIANTS, checkVariant } from '../benchmarks/variants.mjs';

for (const name of ['direct-build', 'no-fork-build']) {
  test(`${name} variant builds and passes its own check`, () => {
    assert.ok(name in VARIANTS);
    assert.deepEqual(checkVariant(name), []);
  });
}

test('flow-direct and flow-nofork match flow-unit except for id and plugin variant', () => {
  const cells = sweepCells();
  const unit = cells.find((cell) => cell.id === 'flow-unit');
  const arms = { 'flow-direct': 'direct-build', 'flow-nofork': 'no-fork-build' };
  for (const [id, pluginVariant] of Object.entries(arms)) {
    const cell = cells.find((candidate) => candidate.id === id);
    assert.deepEqual({ ...cell, id: unit.id, pluginVariant: unit.pluginVariant }, unit);
    assert.equal(cell.pluginVariant, pluginVariant);
  }
  assert.ok(pluginVariants(cells).includes('direct-build'));
});
