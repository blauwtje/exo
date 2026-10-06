import assert from 'node:assert/strict';
import { test } from 'node:test';
import { call, createTestApp } from './support.mjs';

const ids = (app, q) => call(app, 'GET', `/search?q=${encodeURIComponent(q)}`).body.results.map((result) => result.id);

test('finds products by a name word, the last word as a prefix', () => {
  const app = createTestApp();
  assert.deepEqual(ids(app, 'blue'), ['p1', 'p2']);
  assert.deepEqual(ids(app, 'blue mu'), ['p1']);
  assert.deepEqual(ids(app, 'notebook'), ['p2', 'p5', 'p8', 'p11']);
});

test('an empty query is rejected', () => {
  const response = call(createTestApp(), 'GET', '/search?q=%20');
  assert.equal(response.status, 400);
  assert.equal(response.body.error.field, 'q');
});

test('a new product is searchable at once', () => {
  const app = createTestApp();
  assert.deepEqual(ids(app, 'flask'), []);
  call(app, 'POST', '/products', { as: 'u-admin', body: { name: 'Steel Flask', category: 'mugs', price: 1900 } });
  assert.deepEqual(ids(app, 'flask'), ['p13']);
});

test('a stock change shows in the results', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/search?q=linen').body.results[0].inStock, false);
  call(app, 'POST', '/products/p8/stock', { as: 'u-admin', body: { delta: 3 } });
  assert.equal(call(app, 'GET', '/search?q=linen').body.results[0].inStock, true);
});

test('a price change shows in the results', () => {
  const app = createTestApp();
  assert.equal(call(app, 'GET', '/search?q=enamel').body.results[0].price, 1300);
  call(app, 'PUT', '/products/p10/price', { as: 'u-admin', body: { price: 1250 } });
  assert.equal(call(app, 'GET', '/search?q=enamel').body.results[0].price, 1250);
});
