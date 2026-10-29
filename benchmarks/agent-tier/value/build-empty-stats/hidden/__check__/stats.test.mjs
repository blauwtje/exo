import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSummary } from '../src/report.mjs';
import { summarize } from '../src/stats.mjs';

test('empty input summarizes to nulls', () => {
  assert.deepEqual(summarize([]), { count: 0, mean: null, median: null, max: null });
});

test('empty input formats as no data', () => {
  assert.equal(formatSummary([]), 'no data');
});

test('null, undefined and NaN entries are ignored', () => {
  assert.deepEqual(summarize([null, 4, undefined, NaN, 2]), { count: 2, mean: 3, median: 3, max: 4 });
});

test('an input with nothing usable counts as empty', () => {
  assert.deepEqual(summarize([null, NaN, undefined]), { count: 0, mean: null, median: null, max: null });
  assert.equal(formatSummary([NaN]), 'no data');
});

test('a single value is its own mean, median and max', () => {
  assert.deepEqual(summarize([7]), { count: 1, mean: 7, median: 7, max: 7 });
});

test('negative values keep the right max', () => {
  assert.equal(summarize([-5, -2, -9]).max, -2);
});

test('the input array is not modified', () => {
  const values = [3, 1, 2];
  summarize(values);
  assert.deepEqual(values, [3, 1, 2]);
});

test('the numeric report line is unchanged', () => {
  assert.equal(formatSummary([2, 4]), 'count=2 mean=3 median=3 max=4');
});
