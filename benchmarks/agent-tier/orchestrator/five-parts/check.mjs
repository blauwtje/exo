import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'parse-duration',
    run: async ({ load }) => {
      const { parseDuration } = await load('src/duration.mjs');
      assert.equal(parseDuration('1h30m'), 5400);
      assert.equal(parseDuration('45s'), 45);
      assert.equal(parseDuration('2h5s'), 7205);
      assert.equal(parseDuration('10m'), 600);
      for (const bad of ['', '30m1h', '1x', '1.5h', '1h1h', 'h']) assert.throws(() => parseDuration(bad), TypeError, bad);
    }
  },
  {
    name: 'to-roman',
    run: async ({ load }) => {
      const { toRoman } = await load('src/roman.mjs');
      assert.equal(toRoman(1), 'I');
      assert.equal(toRoman(4), 'IV');
      assert.equal(toRoman(49), 'XLIX');
      assert.equal(toRoman(1994), 'MCMXCIV');
      assert.equal(toRoman(3999), 'MMMCMXCIX');
      for (const bad of [0, 4000, 2.5, -3]) assert.throws(() => toRoman(bad), RangeError, String(bad));
    }
  },
  {
    name: 'wrap-text',
    run: async ({ load }) => {
      const { wrapText } = await load('src/wrap.mjs');
      assert.equal(wrapText('the quick brown fox', 10), 'the quick\nbrown fox');
      assert.equal(wrapText('  a   bb\tccc ', 4), 'a bb\nccc');
      assert.equal(wrapText('tiny enormousword x', 5), 'tiny\nenormousword\nx');
      assert.equal(wrapText('   ', 8), '');
    }
  },
  {
    name: 'median-of',
    run: async ({ load }) => {
      const { mean, median } = await load('src/stats.mjs');
      const values = [10, 2, 33];
      assert.equal(median(values), 10);
      assert.deepEqual(values, [10, 2, 33]);
      assert.equal(median([4, 1, 3, 2]), 2.5);
      assert.equal(median([100, 9]), 54.5);
      assert.throws(() => median([]), RangeError);
      assert.equal(mean([1, 2, 3]), 2);
    }
  },
  {
    name: 'csv-row',
    run: async ({ load }) => {
      const { parseCsvRow } = await load('src/csv.mjs');
      assert.deepEqual(parseCsvRow('a,b,c'), ['a', 'b', 'c']);
      assert.deepEqual(parseCsvRow('"x, y",z'), ['x, y', 'z']);
      assert.deepEqual(parseCsvRow('"say ""hi""", ok'), ['say "hi"', ' ok']);
      assert.deepEqual(parseCsvRow('a,,b'), ['a', '', 'b']);
    }
  },
  {
    name: 'run-report',
    run: async ({ load }) => {
      const { runReport } = await load('src/report.mjs');
      assert.equal(runReport(['"Smith, J",1h', 'Lee,30m', 'Ng,2h'], 80), 'III runs, median 3600s: Smith, J, Lee, Ng');
      assert.equal(runReport(['a,10s', 'b,20s', 'c,1m', 'd,1m'], 16), 'IV runs, median\n40s: a, b, c, d');
    }
  }
];

await grade({
  cases,
  result: {
    parts: { 'parse-duration': 'DONE', 'to-roman': 'DONE', 'wrap-text': 'DONE', 'median-of': 'DONE', 'csv-row': 'DONE', 'run-report': 'DONE' },
    together: [['parse-duration', 'to-roman', 'wrap-text', 'median-of', 'csv-row']],
    after: ['parse-duration', 'to-roman', 'wrap-text', 'median-of', 'csv-row'].map((part) => ['run-report', part])
  }
});
