import test from 'node:test';
import assert from 'node:assert/strict';
import { intervalText, knownMean, knownMeanText, pairedArms, pairedByCase, verdictWord } from '../benchmarks/interval-text.mjs';

test('intervalText prints the SE and 95% CI, or no SE for one value', () => {
  assert.match(intervalText({ mean: 1, se: 0.5, lo: 0.02, hi: 1.98, n: 4 }), /^1\.000 se 0\.500 ci95 0\.020\.\.1\.980 \(n=4\)$/);
  assert.equal(intervalText({ mean: 1, se: null, lo: null, hi: null, n: 1 }), '1.000 no SE (n=1)');
  assert.equal(intervalText(null), 'no data');
});

test('verdictWord needs the interval to clear zero', () => {
  assert.equal(verdictWord({ se: 1, lo: 0.1, hi: 2 }), 'better');
  assert.equal(verdictWord({ se: 1, lo: -2, hi: -0.1 }), 'worse');
  assert.equal(verdictWord({ se: 1, lo: -1, hi: 2 }), 'noise');
  assert.equal(verdictWord({ se: null, lo: null, hi: null }), 'no SE');
  assert.equal(verdictWord({ se: 1, lo: 0.1, hi: 2 }, { up: 'rise' }), 'rise');
});

test('knownMean leaves out null and non-finite values and counts them', () => {
  const result = knownMean([1, 3, null, undefined, Number.NaN]);
  assert.equal(result.interval.mean, 2);
  assert.deepEqual([result.excluded, result.total], [3, 5]);
  assert.match(knownMeanText(result), /3 of 5 excluded$/);
  assert.equal(knownMean([null]).interval, null);
});

test('pairedArms pairs per case and averages repeated runs of a case', () => {
  const rows = [
    ['a', 'base', 0], ['a', 'base', 1], ['a', 'cand', 1], ['a', 'cand', 1],
    ['b', 'base', 0], ['b', 'cand', 1], ['c', 'cand', 1]
  ];
  const diff = pairedArms(pairedByCase(rows, (row) => row), 'base', 'cand');
  assert.deepEqual([diff.n, diff.mean], [2, 0.75]);
  assert.equal(pairedArms(pairedByCase([], (row) => row), 'base', 'cand'), null);
});
