import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsvRow } from '../src/csv.mjs';
import { parseDuration } from '../src/duration.mjs';
import { runReport } from '../src/report.mjs';
import { toRoman } from '../src/roman.mjs';
import { median } from '../src/stats.mjs';
import { wrapText } from '../src/wrap.mjs';

test('parseDuration sums ordered units', () => {
  assert.equal(parseDuration('1h30m'), 5400);
  assert.throws(() => parseDuration('30m1h'), TypeError);
});

test('toRoman writes subtractive pairs', () => {
  assert.equal(toRoman(1994), 'MCMXCIV');
  assert.throws(() => toRoman(0), RangeError);
});

test('wrapText fills lines greedily', () => {
  assert.equal(wrapText('a bb ccc', 4), 'a bb\nccc');
});

test('median averages the middle pair', () => {
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.throws(() => median([]), RangeError);
});

test('parseCsvRow keeps quoted commas', () => {
  assert.deepEqual(parseCsvRow('"a, ""b""",c'), ['a, "b"', 'c']);
});

test('runReport wraps the summary line', () => {
  assert.equal(runReport(['x,1m', 'y,3m'], 20), 'II runs, median\n120s: x, y');
});
