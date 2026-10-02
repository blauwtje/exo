import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInvoice, renderInvoice } from '../src/invoice.ts';
import type { Order } from '../src/order.ts';
import { sampleCatalog, SKUS } from './support/catalog.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

const ORDER: Order = {
  id: 'A-1001',
  region: 'NL',
  placedOn: '2024-03-01',
  lines: [{ sku: 'HW-010', quantity: 2 }, { sku: 'BK-001', quantity: 1 }],
  discount: { kind: 'percent', basisPoints: 1000 }
};

test('an invoice taxes each line after its share of the discount', () => {
  const invoice = buildInvoice(ORDER, sampleCatalog());
  assert.equal(invoice.subtotalCents, 10448);
  assert.equal(invoice.discountCents, 1045);
  assert.deepEqual(invoice.lines.map((line) => line.discountCents), [800, 245]);
  assert.deepEqual(invoice.lines.map((line) => line.taxCents), [1512, 198]);
  assert.equal(invoice.totalCents, 11113);
});

test('renderInvoice lists every line and the total', () => {
  const text = renderInvoice(buildInvoice(ORDER, sampleCatalog()));
  assert.match(text, /^Invoice for order A-1001, issued 2024-03-01$/m);
  assert.match(text, /^2 x Desk lamp \(HW-010\) {2}EUR 79\.98$/m);
  assert.match(text, /^Total {5}EUR 111\.13$/m);
});

test('posted invoices balance: total is subtotal less discount plus tax', async () => {
  const catalog = sampleCatalog();
  const random = seededRandom(67);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const lines = Array.from({ length: randomInteger(random, 1, 4) }, () => ({
      sku: SKUS[randomInteger(random, 0, SKUS.length - 1)] ?? 'BK-001',
      quantity: randomInteger(random, 1, 6)
    }));
    const order: Order = { id: `o-${round}`, region: 'DE', placedOn: '2024-03-01', lines, discount: { kind: 'fixed', cents: randomInteger(random, 0, 3000) } };
    const invoice = buildInvoice(order, catalog);
    assert.equal(invoice.lines.reduce((total, line) => total + line.discountCents, 0), invoice.discountCents);
    assert.equal(invoice.totalCents, invoice.subtotalCents - invoice.discountCents + invoice.taxCents);
    expected += invoice.totalCents;
    assert.equal(await ledger.post({ account: 'receivables', cents: invoice.totalCents }), expected);
  }
});
