import assert from 'node:assert/strict';
import { grade } from '../grade.mjs';

const cases = [
  {
    name: 'reserve-limit',
    run: async ({ load }) => {
      const { reserve } = await load('src/stock.mjs');
      assert.throws(() => reserve({ a: 5 }, 'a', 6), RangeError);
      assert.throws(() => reserve({ a: 5 }, 'b', 1), RangeError);
      assert.deepEqual(reserve({ a: 5 }, 'a', 5), { a: 0 });
      const stock = { a: 5 };
      reserve(stock, 'a', 2);
      assert.deepEqual(stock, { a: 5 });
    }
  },
  {
    name: 'fulfil',
    run: async ({ load }) => {
      const { fulfil } = await load('src/fulfil.mjs');
      const order = [{ sku: 'a', qty: 2 }, { sku: 'b', qty: 3 }, { sku: 'a', qty: 3 }];
      assert.deepEqual(fulfil({ a: 5, b: 1 }, order), { stock: { a: 0, b: 1 }, short: ['b'] });
      assert.deepEqual(fulfil({ a: 1 }, []), { stock: { a: 1 }, short: [] });
      assert.deepEqual(fulfil({ a: 1 }, [{ sku: 'a', qty: 2 }, { sku: 'a', qty: 1 }]), { stock: { a: 0 }, short: ['a'] });
    }
  }
];

await grade({
  cases,
  result: {
    parts: { 'reserve-limit': 'DONE', fulfil: 'DONE' },
    after: [['fulfil', 'reserve-limit']]
  }
});
