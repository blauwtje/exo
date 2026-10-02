import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCustomer } from '../src/customer.ts';
import { buildInvoice } from '../src/invoice.ts';
import type { Order } from '../src/order.ts';
import { sampleCatalog } from './support/catalog.ts';

const ORDER: Order = { id: 'B-2001', region: 'DE', placedOn: '2024-03-01', lines: [{ sku: 'HW-010', quantity: 1 }] };

test('a tax-exempt customer pays no tax', () => {
  const customer = createCustomer({ id: 'c-2', name: 'Charity eV', taxExempt: true, paymentTermsDays: 14 });
  const invoice = buildInvoice({ ...ORDER, customer }, sampleCatalog());
  assert.equal(invoice.taxCents, 0);
  assert.equal(invoice.totalCents, 3999);
  assert.equal(invoice.dueOn, '2024-03-15');
});

test('an order without a customer is due on its order date and taxed', () => {
  const invoice = buildInvoice(ORDER, sampleCatalog());
  assert.equal(invoice.taxCents, 760);
  assert.equal(invoice.dueOn, '2024-03-01');
});

test('the tax follows the rate in force on the order date', () => {
  assert.equal(buildInvoice({ ...ORDER, placedOn: '2020-09-01' }, sampleCatalog()).taxCents, 640);
});
