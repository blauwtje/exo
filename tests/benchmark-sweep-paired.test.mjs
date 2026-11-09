import test from 'node:test';
import assert from 'node:assert/strict';
import { pairCells, runPairs } from '../benchmarks/sweep-paired.mjs';

const roots = { base: '/base', candidate: '/cand' };

test('pairs name arms, directories and order by repeat parity', () => {
  const pairs = pairCells([{ id: 'a' }, { id: 'a', repeat: 2 }], roots);
  assert.deepEqual(pairs[0].map((arm) => [arm.arm, arm.pluginDir, arm.repeat, arm.directory]), [
    ['base', '/base', 1, 'a-1-base'],
    ['cand', '/cand', 1, 'a-1-cand'],
  ]);
  assert.deepEqual(pairs[1].map((arm) => arm.directory), ['a-2-cand', 'a-2-base']);
});

test('pool runs ceil(concurrency / 2) pairs at once and never splits a pair', async () => {
  const pairs = pairCells(Array.from({ length: 4 }, (_, index) => ({ id: `c${index}` })), roots);
  let active = 0;
  let peak = 0;
  await runPairs(pairs, 3, async () => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
  });
  assert.equal(peak, 4);
});
