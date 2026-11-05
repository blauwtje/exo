import assert from 'node:assert/strict';
import test from 'node:test';
import { clusteredMeanCi, decideKeep, mad, meanCi, median, pairedDiff, pooledSd } from '../lib/eval-stats.mjs';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} is not ${expected}`);

test('meanCi gives the mean, the standard error of the mean and a z-wide interval', () => {
  const result = meanCi([1, 2, 3, 4]);
  const se = Math.sqrt(5 / 3 / 4);
  assert.equal(result.mean, 2.5);
  assert.equal(result.n, 4);
  close(result.se, se);
  close(result.lo, 2.5 - 1.96 * se);
  close(result.hi, 2.5 + 1.96 * se);
  close(meanCi([1, 2, 3, 4], 1).hi, 2.5 + se);
});

test('meanCi leaves se, lo and hi null under two values and refuses none', () => {
  assert.deepEqual(meanCi([7]), { mean: 7, se: null, lo: null, hi: null, n: 1 });
  assert.throws(() => meanCi([]), RangeError);
});

test('pairedDiff is meanCi over candidate minus base', () => {
  const result = pairedDiff([[1, 2], [3, 5], [2, 2]]);
  const plain = meanCi([1, 2, 0]);
  assert.deepEqual(result, plain);
});

test('clusteredMeanCi equals meanCi when every cluster holds one value', () => {
  const rows = [1, 2, 3, 4].map((value, at) => ({ cluster: `c${at}`, value }));
  assert.deepEqual(clusteredMeanCi(rows), { ...meanCi([1, 2, 3, 4]), clusters: 4 });
});

test('clusteredMeanCi widens the error when values move together within a cluster', () => {
  const rows = [{ cluster: 'a', value: 1 }, { cluster: 'a', value: 1 }, { cluster: 'b', value: 3 }, { cluster: 'b', value: 3 }];
  const result = clusteredMeanCi(rows);
  close(result.se, Math.sqrt(4 / 3 / 4 + 4 / 16));
  assert.ok(result.se > meanCi([1, 1, 3, 3]).se);
  assert.equal(result.clusters, 2);
});

test('clusteredMeanCi has no error with a single cluster', () => {
  const result = clusteredMeanCi([{ cluster: 'a', value: 1 }, { cluster: 'a', value: 3 }]);
  assert.deepEqual(result, { mean: 2, se: null, lo: null, hi: null, n: 2, clusters: 1 });
});

const keepSettings = { z: 1.96, floor: 0, maxRuns: 3 };

test('decideKeep replays the recorded 0dc2ee2e runs 100, 50 and 37.5 against the 46.3 baseline and never keeps', () => {
  const best = { runs: [46.3] };
  const first = decideKeep({ ...keepSettings, best, candidate: { runs: [100] } });
  assert.deepEqual([first.verdict, first.reason, first.se, first.n], ['repeat', 'no-variance', null, 1]);
  const second = decideKeep({ ...keepSettings, best, candidate: { runs: [100, 50] } });
  assert.deepEqual([second.verdict, second.reason, second.mode], ['repeat', 'noise', 'runs']);
  const third = decideKeep({ ...keepSettings, best, candidate: { runs: [100, 50, 37.5] } });
  assert.deepEqual([third.verdict, third.reason, third.n], ['discard', 'noise', 3]);
  close(third.diff, 62.5 - 46.3);
  close(third.se, Math.sqrt(2187.5 / 2) * Math.sqrt(1 + 1 / 3));
  assert.ok(third.lo < 0);
});

test('decideKeep decides a deterministic score from one candidate run', () => {
  const best = { runs: [10, 10] };
  assert.deepEqual(decideKeep({ ...keepSettings, best, candidate: { runs: [12] } }), { verdict: 'keep', mode: 'runs', diff: 2, se: 0, lo: 2, hi: 2, n: 1, reason: 'exact-gain' });
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [10] } }).reason, 'no-gain');
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [7] } }).verdict, 'discard');
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [11] }, floor: 1 }).verdict, 'discard');
});

test('decideKeep discards a gain at or under the floor before any rerun', () => {
  const result = decideKeep({ ...keepSettings, best: { runs: [40, 50] }, candidate: { runs: [46] }, floor: 2 });
  assert.deepEqual([result.verdict, result.reason], ['discard', 'no-gain']);
});

test('decideKeep keeps once the interval clears the floor and repeats while it does not', () => {
  const best = { runs: [40, 42] };
  const keep = decideKeep({ ...keepSettings, best, candidate: { runs: [60] } });
  assert.deepEqual([keep.verdict, keep.reason], ['keep', 'ci-above-floor']);
  assert.ok(keep.lo > 0);
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [43] } }).verdict, 'repeat');
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [43] }, maxRuns: 1 }).reason, 'noise');
});

test('decideKeep without variance repeats up to maxRuns, then discards, unless noiseSd is given', () => {
  const best = { runs: [10] };
  assert.equal(decideKeep({ ...keepSettings, best, candidate: { runs: [20] }, maxRuns: 2 }).verdict, 'repeat');
  assert.deepEqual(decideKeep({ ...keepSettings, best, candidate: { runs: [20] }, maxRuns: 1 }).reason, 'no-variance');
  const known = decideKeep({ ...keepSettings, best, candidate: { runs: [20] }, noiseSd: 1 });
  close(known.se, Math.SQRT2);
  assert.equal(known.verdict, 'keep');
});

test('decideKeep pairs shared items and drops their common spread', () => {
  const best = { runs: [50, 52], items: { a: [20, 22], b: [80, 82], c: [50, 52] } };
  const candidate = { runs: [53], items: { a: [24], b: [84], c: [54], d: [1] } };
  const paired = decideKeep({ ...keepSettings, best, candidate });
  assert.equal(paired.mode, 'paired');
  close(paired.diff, 3);
  assert.equal(paired.se, 0);
  assert.equal(paired.verdict, 'keep');
  const spread = decideKeep({ ...keepSettings, best, candidate: { runs: [53], items: { a: [25], b: [83], c: [55] } } });
  close(spread.diff, 10 / 3);
  close(spread.se, Math.sqrt(4 / 3) / Math.sqrt(3));
  assert.equal(spread.mode, 'paired');
});

test('decideKeep falls back to runs when fewer than two items are shared', () => {
  const result = decideKeep({ ...keepSettings, best: { runs: [10, 10], items: { a: [10] } }, candidate: { runs: [12], items: { a: [12], b: [3] } } });
  assert.equal(result.mode, 'runs');
});

test('pooledSd pools within-group spread and falls back with no degrees of freedom', () => {
  close(pooledSd([[1, 3], [10, 10, 10], [5]]), Math.sqrt(2 / 3));
  assert.equal(pooledSd([[1], [2]]), null);
  assert.equal(pooledSd([], 0.5), 0.5);
});

test('decideKeep throws naming each keep setting the call leaves out', () => {
  const call = { best: { runs: [10] }, candidate: { runs: [12] } };
  assert.throws(() => decideKeep(call), { message: 'decideKeep needs z, floor, maxRuns' });
  assert.throws(() => decideKeep({ ...call, z: 1.96, maxRuns: 3 }), { message: 'decideKeep needs floor' });
});

test('median takes the middle value or the mean of the two middle values', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('mad is the median absolute deviation from the median', () => {
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
});

test('median and mad reject an empty list', () => {
  assert.throws(() => median([]), RangeError);
  assert.throws(() => mad([]), RangeError);
});
