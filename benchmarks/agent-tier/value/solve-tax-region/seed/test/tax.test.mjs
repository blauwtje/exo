import assert from 'node:assert/strict';
import test from 'node:test';
import { invoiceTotal } from '../src/invoice.mjs';
import { loadRates } from '../src/rates.mjs';
import { taxFor } from '../src/tax.mjs';

test('loadRates reads simple lines', () => {
  assert.deepEqual(loadRates('nl:21\nde:19'), { nl: { percent: 21 }, de: { percent: 19 } });
});

test('taxFor applies the regional percentage', () => {
  assert.equal(taxFor({ region: 'us-ca', netMinor: 1000 }), 73);
});

test('invoiceTotal adds the tax to the net amount', () => {
  assert.equal(invoiceTotal({ region: 'US-CA', netMinor: 2000 }), 2145);
});
