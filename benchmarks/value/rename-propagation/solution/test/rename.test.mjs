import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, createTestApp } from './support.mjs';

test('a rename reaches the index, caches, carts, wishlists and the audit log but not orders', () => {
  const app = createTestApp();
  call(app, 'GET', '/products');
  call(app, 'GET', '/search?q=blue');
  const renamed = call(app, 'PATCH', '/products/p1', { as: 'u-admin', body: { name: 'Cobalt Mug' } });
  assert.equal(renamed.body.product.name, 'Cobalt Mug');
  assert.equal(call(app, 'GET', '/products').body.products[0].name, 'Cobalt Mug');
  assert.deepEqual(call(app, 'GET', '/search?q=blue').body.results.map((r) => r.id), ['p2']);
  assert.equal(call(app, 'GET', '/carts/c-ben', { as: 'u-ben' }).body.cart.lines[0].name, 'Cobalt Mug');
  assert.equal(call(app, 'GET', '/wishlists/u-ana', { as: 'u-ana' }).body.items[0].name, 'Cobalt Mug');
  assert.equal(call(app, 'GET', '/orders/o-1001', { as: 'u-ana' }).body.order.lines[0].name, 'Blue Mug');
  const [event] = call(app, 'GET', '/audit?entity=product:p1', { as: 'u-admin' }).body.events;
  assert.deepEqual(event.changes, { name: { from: 'Blue Mug', to: 'Cobalt Mug' } });
});
