import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, createTestApp } from './support.mjs';

test('placing an order snapshots the cart and empties it', () => {
  const app = createTestApp();
  const placed = call(app, 'POST', '/orders', { as: 'u-ben', body: { cartId: 'c-ben' } });
  assert.equal(placed.status, 201);
  assert.equal(placed.body.order.id, 'o-1003');
  assert.equal(placed.body.order.totalCents, 1200 + 1100 * 3);
  assert.deepEqual(call(app, 'GET', '/carts/c-ben', { as: 'u-ben' }).body.cart.lines, []);
});

test('an empty cart cannot be ordered', () => {
  const app = createTestApp();
  call(app, 'POST', '/orders', { as: 'u-dee', body: { cartId: 'c-dee' } });
  const second = call(app, 'POST', '/orders', { as: 'u-dee', body: { cartId: 'c-dee' } });
  assert.equal(second.status, 400);
  assert.equal(second.body.error.field, 'cartId');
});

test('an order keeps the price it was bought at', () => {
  const app = createTestApp();
  const before = call(app, 'GET', '/orders/o-1002', { as: 'u-ben' }).body.order;
  call(app, 'PUT', '/products/p1/price', { as: 'u-admin', body: { price: 1500 } });
  assert.deepEqual(call(app, 'GET', '/orders/o-1002', { as: 'u-ben' }).body.order, before);
  assert.equal(before.lines[0].unitPrice, 1100);
});

test('only the buyer or an admin reads an order', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/orders/o-1001', { as: 'u-ben' }).status, 403);
  assert.equal(call(app, 'GET', '/orders/o-1001', { as: 'u-admin' }).status, 200);
  assert.equal(call(app, 'GET', '/orders/o-9999', { as: 'u-admin' }).status, 404);
});

test('placing an order writes an audit event', () => {
  const app = createTestApp();
  call(app, 'POST', '/orders', { as: 'u-ana', body: { cartId: 'c-ana' } });
  const events = call(app, 'GET', '/audit?entity=order:o-1003', { as: 'u-admin' }).body.events;
  assert.equal(events[0].action, 'order.placed');
  assert.equal(events[0].actor, 'u-ana');
});
