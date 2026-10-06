import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, createTestApp } from './support.mjs';

test('an owner reads the cart with its total', () => {
  const app = createTestApp();
  const { cart } = call(app, 'GET', '/carts/c-ana', { as: 'u-ana' }).body;
  assert.equal(cart.lines.length, 2);
  assert.equal(cart.totalCents, 1200 * 2 + 1850);
});

test('another customer cannot read the cart, an admin can', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/carts/c-ana', { as: 'u-ben' }).status, 403);
  assert.equal(call(app, 'GET', '/carts/c-ana', { as: 'u-ops' }).status, 200);
});

test('adding a line copies the product name and price, and a repeat adds up', () => {
  const app = createTestApp();
  call(app, 'POST', '/carts/c-dee/lines', { as: 'u-dee', body: { productId: 'p12', qty: 2 } });
  const again = call(app, 'POST', '/carts/c-dee/lines', { as: 'u-dee', body: { productId: 'p12' } });
  const line = again.body.cart.lines.find((candidate) => candidate.productId === 'p12');
  assert.deepEqual(line, { productId: 'p12', name: 'Jasmine Tea', unitPrice: 820, qty: 3 });
});

test('a quantity outside 1 to 99 is rejected', () => {
  const response = call(createTestApp(), 'POST', '/carts/c-dee/lines', { as: 'u-dee', body: { productId: 'p12', qty: 100 } });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.field, 'qty');
});

test('removing a line writes an audit event', () => {
  const app = createTestApp();
  call(app, 'DELETE', '/carts/c-ana/lines/p3', { as: 'u-ana' });
  const events = call(app, 'GET', '/audit?entity=cart:c-ana', { as: 'u-admin' }).body.events;
  assert.deepEqual(events.map((event) => event.action), ['cart.line_removed']);
});

test('a price change reprices the lines in every cart', () => {
  const app = createTestApp();
  call(app, 'PUT', '/products/p1/price', { as: 'u-admin', body: { price: 1300 } });
  for (const [cartId, owner] of [['c-ana', 'u-ana'], ['c-ben', 'u-ben']]) {
    const line = call(app, 'GET', `/carts/${cartId}`, { as: owner }).body.cart.lines.find((candidate) => candidate.productId === 'p1');
    assert.equal(line.unitPrice, 1300);
  }
});

test('a wishlist lists the products a user saved', () => {
  const app = createTestApp();
  const { items } = call(app, 'GET', '/wishlists/u-ana', { as: 'u-ana' }).body;
  assert.deepEqual(items.map((item) => item.name), ['Blue Mug', 'Matcha Tea Tin']);
  assert.equal(call(app, 'GET', '/wishlists/u-ana', { as: 'u-ben' }).status, 403);
});

test('saving a product to a wishlist copies its name once', () => {
  const app = createTestApp();
  call(app, 'POST', '/wishlists/u-dee/items', { as: 'u-dee', body: { productId: 'p12' } });
  const again = call(app, 'POST', '/wishlists/u-dee/items', { as: 'u-dee', body: { productId: 'p12' } });
  assert.deepEqual(again.body.items.map((item) => item.name), ['Ceramic Mug Set', 'Jasmine Tea']);
});
