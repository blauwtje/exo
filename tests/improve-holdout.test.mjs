import assert from 'node:assert/strict';
import test from 'node:test';
import { clearlyWorse, heldOutDiff, itemsMean, planHoldout, splitIds, splitItems } from '../lib/holdout.mjs';

const IDS = Array.from({ length: 12 }, (_, at) => `case-${at}`);

test('the split depends only on the ids, not their order or repeats', () => {
  const split = splitIds(IDS, 0.25);
  assert.equal(split.held.length, 3);
  assert.equal(split.tune.length, 9);
  assert.deepEqual(splitIds([...IDS].reverse(), 0.25), split);
  assert.deepEqual(splitIds([...IDS, ...IDS.slice(0, 4)], 0.25), split);
  assert.deepEqual([...split.held, ...split.tune].sort(), [...IDS].sort());
});

test('adding a case keeps every earlier held-out case held out or moves at most one', () => {
  const before = splitIds(IDS.slice(0, 11), 0.25).held;
  const after = splitIds(IDS, 0.25).held;
  assert.ok(before.filter((id) => !after.includes(id)).length <= 1);
});

test('planHoldout holds out nothing under holdoutMin ids, with no held share or under two tuning ids', () => {
  const settings = { holdoutMin: 8, holdoutShare: 0.25 };
  assert.equal(planHoldout(IDS.slice(0, 7), settings), null);
  assert.equal(planHoldout([], settings), null);
  assert.equal(planHoldout(IDS, { ...settings, holdoutShare: 0 }), null);
  assert.equal(planHoldout(IDS.slice(0, 8), { holdoutMin: 8, holdoutShare: 0.9 }), null);
  assert.deepEqual(planHoldout(IDS.slice(0, 8), settings), { held: splitIds(IDS.slice(0, 8), 0.25).held, cases: 8 });
});

test('splitItems sorts each value into tuning or held-out by id', () => {
  assert.deepEqual(splitItems({ a: 1, b: 2, c: 3 }, ['b']), { tune: { a: 1, c: 3 }, held: { b: 2 } });
});

test('itemsMean averages per-case means and is null with no values', () => {
  assert.equal(itemsMean({ a: [1, 3], b: [6] }), 4);
  assert.equal(itemsMean({ a: [] }), null);
  assert.equal(itemsMean({}), null);
});

test('heldOutDiff pairs cases both sides scored, oriented by sign, and clearlyWorse needs the upper bound below 0', () => {
  const base = { a: [50], b: [50], c: [50] };
  const worse = heldOutDiff(base, { a: [20], b: [30], d: [99] }, { z: 1.96 });
  assert.deepEqual([worse.mean, worse.se, worse.cases], [-25, 5, 2]);
  assert.equal(clearlyWorse(worse), true);
  assert.equal(clearlyWorse(heldOutDiff(base, { a: [20], b: [30] }, { z: 1.96, sign: -1 })), false);
  assert.equal(clearlyWorse(heldOutDiff(base, { a: [40], b: [70] }, { z: 1.96 })), false);
  assert.equal(clearlyWorse(heldOutDiff(base, { a: [10] }, { z: 1.96 })), false);
  assert.equal(heldOutDiff(base, { d: [1] }, { z: 1.96 }), null);
  assert.equal(clearlyWorse(null), false);
});
