import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCatalog, findProduct } from '../src/catalog.ts';
import { sampleCatalog, SKUS } from './support/catalog.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('findProduct returns the product of a known SKU', () => {
  assert.equal(findProduct(sampleCatalog(), 'HW-010').name, 'Desk lamp');
});

test('findProduct refuses an unknown SKU', () => {
  assert.throws(() => findProduct(sampleCatalog(), 'XX-999'), /unknown SKU XX-999/);
});

test('createCatalog refuses a duplicate SKU and a negative price', () => {
  const lamp = { sku: 'HW-010', name: 'Desk lamp', unitPriceCents: 3999, category: 'standard' } as const;
  assert.throws(() => createCatalog([lamp, lamp]), /duplicate SKU/);
  assert.throws(() => createCatalog([{ ...lamp, unitPriceCents: -1 }]), RangeError);
});

test('posted stock valuations balance to price times quantity', async () => {
  const catalog = sampleCatalog();
  const random = seededRandom(23);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const sku = SKUS[randomInteger(random, 0, SKUS.length - 1)] ?? 'BK-001';
    const quantity = randomInteger(random, 1, 40);
    const cents = findProduct(catalog, sku).unitPriceCents * quantity;
    expected += cents;
    assert.equal(await ledger.post({ account: 'stock', cents }), expected);
  }
});
