import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'negative-amount',
    run: async ({ load }) => {
      const { parseAmount } = await load('src/parse.mjs');
      assert.throws(() => parseAmount('-4'), RangeError);
      assert.throws(() => parseAmount(' -0.01 '), RangeError);
      assert.equal(parseAmount('0'), 0);
      assert.equal(parseAmount('7'), 7);
      assert.throws(() => parseAmount('x'), TypeError);
    }
  },
  {
    name: 'totals',
    run: async ({ load }) => {
      const { totalOf } = await load('src/totals.mjs');
      assert.equal(totalOf(['1', '', '  ', '2.5', '3']), 6.5);
      assert.equal(totalOf([]), 0);
      assert.throws(() => totalOf(['1', '-2']), RangeError);
      assert.throws(() => totalOf(['1', 'nope']), TypeError);
    }
  }
];

await grade({
  cases,
  result: {
    parts: { 'negative-amount': 'DONE', totals: 'DONE' },
    after: [['totals', 'negative-amount']]
  }
});
