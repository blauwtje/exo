import assert from 'node:assert/strict';
import test from 'node:test';

import { sweepCells, pluginVariants } from '../benchmarks/sweep-cells.mjs';
import { VARIANTS, checkVariant } from '../benchmarks/variants.mjs';

for (const name of ['no-fork-build']) {
  test(`${name} variant builds and passes its own check`, () => {
    assert.ok(name in VARIANTS);
    assert.deepEqual(checkVariant(name), []);
  });
}

test('flow-nofork matches flow-unit except for id and plugin variant', () => {
  const cells = sweepCells();
  const unit = cells.find((cell) => cell.id === 'flow-unit');
  const arms = { 'flow-nofork': 'no-fork-build' };
  for (const [id, pluginVariant] of Object.entries(arms)) {
    const cell = cells.find((candidate) => candidate.id === id);
    assert.deepEqual({ ...cell, id: unit.id, pluginVariant: unit.pluginVariant }, unit);
    assert.equal(cell.pluginVariant, pluginVariant);
  }
  assert.ok(pluginVariants(cells).includes('no-fork-build'));
});

test('no-fork-build keeps its name with an empty edit list', () => {
  assert.deepEqual(VARIANTS['no-fork-build'].edits, []);
});
