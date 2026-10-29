import assert from 'node:assert/strict';

export const cases = [
  {
    name: 'every listed region gives the exact tax however the order spells it',
    run: async ({ load }) => {
      const { taxFor } = await load('src/tax.mjs');
      for (const region of ['nl', 'NL', 'Nl', ' nl ']) assert.equal(taxFor({ region, netMinor: 1000 }), 210, region);
      for (const region of ['de', 'DE', 'De', 'dE\t']) assert.equal(taxFor({ region, netMinor: 1000 }), 190, region);
      for (const region of ['us-ca', 'US-CA', 'us-CA']) assert.equal(taxFor({ region, netMinor: 1999 }), 145, region);
      assert.equal(taxFor({ region: 'FR', netMinor: 2500 }), 500);
    }
  },
  {
    name: 'invoiceTotal is exact for the hand-written regions',
    run: async ({ load }) => {
      const { invoiceTotal } = await load('src/invoice.mjs');
      assert.equal(invoiceTotal({ region: 'NL', netMinor: 10000 }), 12100);
      assert.equal(invoiceTotal({ region: 'De', netMinor: 10000 }), 11900);
      assert.equal(invoiceTotal({ region: 'fr', netMinor: 10000 }), 12000);
    }
  },
  {
    name: 'loadRates normalizes keys and skips comments and blank lines',
    run: async ({ load }) => {
      const { loadRates } = await load('src/rates.mjs');
      const rates = loadRates('# note: reduced\n\n  NL = 21 \nDe: 19\r\n  # indented: 5\nUS-CA=7.25\n');
      assert.deepEqual(Object.keys(rates).sort(), ['de', 'nl', 'us-ca']);
      assert.equal(rates.nl.percent, 21);
      assert.equal(rates.de.percent, 19);
      assert.equal(rates['us-ca'].percent, 7.25);
    }
  },
  {
    name: 'an unlisted region fails with an error that names it, not a TypeError',
    run: async ({ load }) => {
      const { taxFor } = await load('src/tax.mjs');
      for (const region of ['xx', 'Atlantis', '']) {
        let caught;
        try {
          taxFor({ region, netMinor: 1000 });
        } catch (error) {
          caught = error;
        }
        assert.ok(caught, `no error for "${region}"`);
        assert.ok(!(caught instanceof TypeError), `TypeError for "${region}": ${caught.message}`);
        assert.ok(caught.message.includes(region), `message "${caught.message}" lacks "${region}"`);
      }
    }
  }
];
