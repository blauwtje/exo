import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderExport } from '../src/export/writer.mjs';

test('renderExport writes the header and one row per line', () => {
  const text = renderExport([
    { customerId: 'C001', customer: 'Alder Works', billingCurrency: 'EUR', transactions: 3, totalMinor: 123456 },
    { customerId: 'C002', customer: 'Birch, Supply', billingCurrency: 'USD', transactions: 1, totalMinor: -250 }
  ]);
  assert.equal(text, [
    'customer_id,customer,billing_currency,transactions,total_eur',
    'C001,Alder Works,EUR,3,1234.56',
    'C002,"Birch, Supply",USD,1,-2.50',
    ''
  ].join('\n'));
});

test('an empty export still has its header', () => {
  assert.equal(renderExport([]), 'customer_id,customer,billing_currency,transactions,total_eur\n');
});
