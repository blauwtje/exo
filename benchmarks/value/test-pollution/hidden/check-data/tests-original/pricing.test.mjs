import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { priceCart } from '../src/pricing/engine.mjs';
import { fixtureTenants } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

test('a line is priced with tax', () => {
  const cart = priceCart(tenants.acme, [{ sku: 'WIDGET-1', quantity: 3 }]);
  assert.deepEqual([cart.subtotal, cart.tax, cart.total], [3000, 240, 3240]);
});

test('ten units earn the first volume discount', () => {
  const cart = priceCart(tenants.acme, [{ sku: 'CABLE-1', quantity: 10 }]);
  assert.equal(cart.lines[0].discount, 175);
  assert.equal(cart.subtotal, 3325);
});

test('an empty cart is refused', () => {
  assert.throws(() => priceCart(tenants.acme, []), /empty/);
});

test('a cart over the line limit is refused', () => {
  const items = Array.from({ length: 26 }, () => ({ sku: 'CABLE-1', quantity: 1 }));
  assert.throws(() => priceCart(tenants.acme, items), /at most 25 lines/);
});

test('a tenant price override is used', () => {
  const cart = priceCart(tenants.globex, [{ sku: 'GADGET-2', quantity: 1 }]);
  assert.deepEqual([cart.subtotal, cart.tax, cart.total, cart.currency], [4500, 855, 5355, 'EUR']);
});

test('a tenant rounding mode is applied', () => {
  const cart = priceCart(tenants.initech, [{ sku: 'CABLE-1', quantity: 3 }]);
  assert.deepEqual([cart.subtotal, cart.tax, cart.total], [1050, 210, 1260]);
  assert.equal(priceCart(tenants.initech, [{ sku: 'CABLE-2', quantity: 1 }]).tax, 95);
});
