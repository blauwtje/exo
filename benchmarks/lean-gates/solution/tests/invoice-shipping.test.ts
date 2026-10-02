import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInvoice } from '../src/invoice.ts';
import type { Order } from '../src/order.ts';
import { sampleCatalog } from './support/catalog.ts';

const ORDER: Order = {
  id: 'C-3001',
  region: 'NL',
  placedOn: '2024-03-01',
  lines: [{ sku: 'HW-010', quantity: 1 }, { sku: 'GC-050', quantity: 1 }],
  shippingCents: 899
};

test('shipping is spread over the lines by net and taxed at each line rate', () => {
  const invoice = buildInvoice(ORDER, sampleCatalog());
  assert.deepEqual(invoice.lines.map((line) => line.shippingCents), [400, 499]);
  assert.deepEqual(invoice.lines.map((line) => line.taxCents), [924, 0]);
  assert.equal(invoice.shippingCents, 899);
  assert.equal(invoice.totalCents, 8999 + 899 + 924);
});

test('an order without shipping charges none', () => {
  const invoice = buildInvoice({ ...ORDER, shippingCents: undefined }, sampleCatalog());
  assert.equal(invoice.shippingCents, 0);
  assert.deepEqual(invoice.lines.map((line) => line.shippingCents), [0, 0]);
});
