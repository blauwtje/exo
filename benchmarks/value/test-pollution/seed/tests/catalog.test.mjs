import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { listPrice } from '../src/catalog/price-list.mjs';
import { PRODUCTS, findProduct } from '../src/catalog/products.mjs';
import { fixtureTenants } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

test('an unknown sku is a not-found error', () => {
  assert.throws(() => findProduct('NOPE-1'), /unknown sku/);
});

test('a tenant without an override pays the base price', () => {
  assert.equal(listPrice(tenants.acme, 'GADGET-2'), 4000);
});

test('the base price applies to skus no tenant overrides', () => {
  assert.equal(listPrice(tenants.globex, 'WIDGET-1'), 1000);
});

test('every product has a category and a positive price', () => {
  for (const product of PRODUCTS) {
    assert.ok(product.category);
    assert.ok(product.basePrice > 0);
  }
});
