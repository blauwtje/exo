import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSummary } from '../src/report.mjs';
import { summarize } from '../src/stats.mjs';

test('summarize odd and even counts', () => {
  assert.deepEqual(summarize([3, 1, 2]), { count: 3, mean: 2, median: 2, max: 3 });
  assert.deepEqual(summarize([4, 1, 3, 2]), { count: 4, mean: 2.5, median: 2.5, max: 4 });
});

test('formatSummary prints one line', () => {
  assert.equal(formatSummary([1, 2, 3]), 'count=3 mean=2 median=2 max=3');
});

test('empty input has no statistics', () => {
  assert.deepEqual(summarize([]), { count: 0, mean: null, median: null, max: null });
  assert.equal(formatSummary([]), 'no data');
});
