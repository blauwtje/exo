import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lineNetCents, orderSubtotal, type Order } from '../src/order.ts';
import { sampleCatalog, SKUS } from './support/catalog.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('a line nets price times quantity', () => {
  assert.equal(lineNetCents({ sku: 'HW-022', quantity: 3 }, sampleCatalog()), 3825);
});

test('a line refuses a zero or fractional quantity', () => {
  assert.throws(() => lineNetCents({ sku: 'HW-022', quantity: 0 }, sampleCatalog()), RangeError);
  assert.throws(() => lineNetCents({ sku: 'HW-022', quantity: 1.5 }, sampleCatalog()), RangeError);
});

test('posted order subtotals balance to the sum of their lines', async () => {
  const catalog = sampleCatalog();
  const random = seededRandom(53);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const lines = Array.from({ length: randomInteger(random, 1, 5) }, () => ({
      sku: SKUS[randomInteger(random, 0, SKUS.length - 1)] ?? 'BK-001',
      quantity: randomInteger(random, 1, 9)
    }));
    const order: Order = { id: `o-${round}`, region: 'NL', placedOn: '2024-03-01', lines };
    const subtotal = orderSubtotal(order, catalog);
    assert.equal(subtotal, lines.reduce((total, line) => total + lineNetCents(line, catalog), 0));
    expected += subtotal;
    assert.equal(await ledger.post({ account: 'orders', cents: subtotal }), expected);
  }
});
