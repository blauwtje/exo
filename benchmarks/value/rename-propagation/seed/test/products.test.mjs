import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, createTestApp } from './support.mjs';

test('lists every product and filters by category', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/products').body.products.length, 12);
  const mugs = call(app, 'GET', '/products?category=mugs').body.products;
  assert.deepEqual(mugs.map((product) => product.id), ['p1', 'p4', 'p7', 'p10']);
});

test('an unknown product is a 404 in the error shape', () => {
  const response = call(createTestApp(), 'GET', '/products/p99');
  assert.equal(response.status, 404);
  assert.deepEqual(response.body, { error: { code: 'not_found', message: 'product p99 not found' } });
});

test('creating a product needs an admin and a free name', () => {
  const app = createTestApp();
  const body = { name: 'Steel Flask', category: 'mugs', price: 1900, stock: 10 };
  assert.equal(call(app, 'POST', '/products', { body }).status, 401);
  assert.equal(call(app, 'POST', '/products', { as: 'u-ana', body }).status, 403);
  const created = call(app, 'POST', '/products', { as: 'u-admin', body });
  assert.equal(created.status, 201);
  assert.equal(created.body.product.id, 'p13');
  const clash = call(app, 'POST', '/products', { as: 'u-admin', body: { ...body, name: 'steel flask' } });
  assert.equal(clash.status, 409);
  assert.deepEqual(Object.keys(clash.body.error).sort(), ['code', 'field', 'message']);
});

test('creating a product rejects a bad name with the field named', () => {
  const app = createTestApp();
  const long = call(app, 'POST', '/products', { as: 'u-admin', body: { name: 'x'.repeat(81), category: 'tea', price: 100 } });
  assert.equal(long.status, 400);
  assert.equal(long.body.error.code, 'invalid_input');
  assert.equal(long.body.error.field, 'name');
});

test('a price change updates the product and writes an audit event', () => {
  const app = createTestApp();
  const response = call(app, 'PUT', '/products/p1/price', { as: 'u-admin', body: { price: 1350 } });
  assert.equal(response.status, 200);
  assert.equal(response.body.product.price, 1350);
  const events = call(app, 'GET', '/audit?entity=product:p1', { as: 'u-admin' }).body.events;
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {
    id: 'evt-1',
    at: events[0].at,
    actor: 'u-admin',
    action: 'product.price_changed',
    entity: { type: 'product', id: 'p1' },
    changes: { price: { from: 1200, to: 1350 } },
  });
});

test('a rejected price change leaves no audit event', () => {
  const app = createTestApp();
  const response = call(app, 'PUT', '/products/p1/price', { as: 'u-admin', body: { price: -1 } });
  assert.equal(response.status, 400);
  assert.deepEqual(call(app, 'GET', '/audit', { as: 'u-admin' }).body.events, []);
});

test('a stock adjustment cannot go below zero', () => {
  const app = createTestApp();
  assert.equal(call(app, 'POST', '/products/p8/stock', { as: 'u-admin', body: { delta: -1 } }).status, 400);
  const added = call(app, 'POST', '/products/p8/stock', { as: 'u-admin', body: { delta: 5 } });
  assert.equal(added.body.product.stock, 5);
});

test('the audit log is for admins', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/audit', { as: 'u-ana' }).status, 403);
});
