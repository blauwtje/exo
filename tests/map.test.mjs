import test from 'node:test';
import assert from 'node:assert/strict';
import { mapItems } from '../lib/map.mjs';

const run = async (item) => ({ value: item * 2, costUsd: 0.25 });

test('maps every item under the cap', async () => {
  const outcome = await mapItems({ items: [1, 2, 3], run, capUsd: 5 });
  assert.deepEqual(outcome.results, [2, 4, 6]);
  assert.equal(outcome.stopped, false);
});

test('stops the fan-out once spend reaches the cap', async () => {
  const outcome = await mapItems({ items: [1, 2, 3, 4], run, capUsd: 0.5 });
  assert.deepEqual(outcome.results, [2, 4]);
  assert.equal(outcome.stopped, true);
  assert.equal(outcome.remaining, 2);
});

test('a zero cap runs nothing', async () => {
  const outcome = await mapItems({ items: [1], run, capUsd: 0 });
  assert.deepEqual(outcome.results, []);
});

test('a run without a finite costUsd throws instead of bypassing the cap', async () => {
  for (const costUsd of [undefined, NaN, Infinity]) {
    await assert.rejects(mapItems({ items: [1, 2, 3], run: async (item) => ({ value: item, costUsd }), capUsd: 0.5 }), TypeError);
  }
});
