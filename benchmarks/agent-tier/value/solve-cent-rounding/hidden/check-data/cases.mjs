import assert from 'node:assert/strict';

const cents = (text) => {
  assert.match(text, /^-?\d+\.\d{2}$/, `not a two-decimal string: ${text}`);
  return Math.round(Number(text) * 100);
};

const halfUp = (value, percent) => Math.floor((value * percent + 50) / 100);

export const cases = [
  {
    name: 'invoice follows the half-up rule on known awkward orders',
    run: async ({ load }) => {
      const { invoice } = await load('src/pricing.mjs');
      assert.deepEqual(invoice([{ price: 10.3, qty: 1 }], { discountPercent: 15, vatPercent: 21 }), { subtotal: '10.30', discount: '1.55', vat: '1.84', total: '10.59' });
      assert.deepEqual(invoice([{ price: 0.1, qty: 3 }, { price: 0.2, qty: 1 }], { vatPercent: 21 }), { subtotal: '0.50', discount: '0.00', vat: '0.11', total: '0.61' });
      assert.deepEqual(invoice([{ price: 0.35, qty: 1 }], { discountPercent: 50 }), { subtotal: '0.35', discount: '0.18', vat: '0.00', total: '0.17' });
      assert.deepEqual(invoice([{ price: 8.25, qty: 1 }], { vatPercent: 10 }), { subtotal: '8.25', discount: '0.00', vat: '0.83', total: '9.08' });
      assert.deepEqual(invoice([{ price: 19.99, qty: 3 }, { price: 0.07, qty: 100 }], { discountPercent: 10, vatPercent: 21 }), { subtotal: '66.97', discount: '6.70', vat: '12.66', total: '72.93' });
    }
  },
  {
    name: 'invoice parts add up and match integer arithmetic over a sweep of prices',
    run: async ({ load }) => {
      const { invoice } = await load('src/pricing.mjs');
      const failures = [];
      for (let priceCents = 1; priceCents <= 400 && failures.length < 3; priceCents += 1) {
        for (const qty of [1, 3, 7]) {
          for (const [discountPercent, vatPercent] of [[0, 21], [5, 9], [15, 21], [50, 10], [12, 6]]) {
            const result = invoice([{ price: priceCents / 100, qty }], { discountPercent, vatPercent });
            const subtotal = priceCents * qty;
            const discount = halfUp(subtotal, discountPercent);
            const vat = halfUp(subtotal - discount, vatPercent);
            const expected = [subtotal, discount, vat, subtotal - discount + vat];
            const actual = [result.subtotal, result.discount, result.vat, result.total].map(cents);
            if (actual.join() !== expected.join()) failures.push(`${priceCents / 100} x${qty} -${discountPercent}% +${vatPercent}%: got ${actual.join('/')} want ${expected.join('/')}`);
          }
        }
      }
      assert.deepEqual(failures, []);
    }
  },
  {
    name: 'invoice sums many small lines exactly',
    run: async ({ load }) => {
      const { invoice } = await load('src/pricing.mjs');
      const lines = Array.from({ length: 30 }, () => ({ price: 0.1, qty: 1 }));
      assert.equal(invoice(lines).total, '3.00');
      assert.equal(invoice([{ price: 0.07, qty: 100 }, { price: 4.35, qty: 100 }]).total, '442.00');
    }
  },
  {
    name: 'splitTotal shares add up to the total and differ by at most one cent',
    run: async ({ load }) => {
      const { splitTotal } = await load('src/pricing.mjs');
      assert.deepEqual(splitTotal(10, 3), ['3.34', '3.33', '3.33']);
      assert.deepEqual(splitTotal(0.05, 2), ['0.03', '0.02']);
      assert.deepEqual(splitTotal(19.99, 4), ['5.00', '5.00', '5.00', '4.99']);
      assert.deepEqual(splitTotal(100, 7), ['14.29', '14.29', '14.29', '14.29', '14.28', '14.28', '14.28']);
      const failures = [];
      for (const total of [0.01, 0.1, 0.29, 1.15, 33.33, 100.01, 1234.56]) {
        for (const parts of [1, 2, 3, 4, 6, 7, 11]) {
          const shares = splitTotal(total, parts).map(cents);
          const sum = shares.reduce((left, right) => left + right, 0);
          const spread = Math.max(...shares) - Math.min(...shares);
          if (shares.length !== parts || sum !== Math.round(total * 100) || spread > 1 || shares.some((share, index) => index > 0 && share > shares[index - 1])) failures.push(`${total}/${parts}: ${shares.join()}`);
        }
      }
      assert.deepEqual(failures, []);
    }
  }
];
