import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCache } from '../src/cache/store.mjs';
import { invalidateListings, invalidateProduct } from '../src/cache/invalidate.mjs';
import { call, createTestApp } from './support.mjs';

test('reads fill the cache', () => {
  const app = createTestApp();
  call(app, 'GET', '/products/p1');
  call(app, 'GET', '/products?category=tea');
  call(app, 'GET', '/search?q=Mug');
  assert.deepEqual(app.services.cache.keys().sort(), ['product:p1', 'products:list:tea', 'search:mug']);
});

test('invalidating a product drops its key, every list and every search', () => {
  const cache = createCache();
  for (const key of ['product:p1', 'product:p2', 'products:list:all', 'products:list:tea', 'search:mug']) cache.set(key, {});
  invalidateProduct(cache, 'p1');
  assert.deepEqual(cache.keys(), ['product:p2']);
});

test('invalidating listings keeps single-product entries', () => {
  const cache = createCache();
  for (const key of ['product:p1', 'products:list:all', 'search:mug']) cache.set(key, {});
  invalidateListings(cache);
  assert.deepEqual(cache.keys(), ['product:p1']);
});

test('a price change is visible through a warm cache', () => {
  const app = createTestApp();
  call(app, 'GET', '/products/p1');
  call(app, 'GET', '/products');
  call(app, 'PUT', '/products/p1/price', { as: 'u-admin', body: { price: 1500 } });
  assert.equal(call(app, 'GET', '/products/p1').body.product.price, 1500);
  assert.equal(call(app, 'GET', '/products').body.products[0].price, 1500);
});

test('entries expire after the time-to-live', () => {
  let clock = 0;
  const cache = createCache({ ttlMs: 100, now: () => clock });
  cache.set('k', { v: 1 });
  clock = 99;
  assert.deepEqual(cache.get('k'), { v: 1 });
  clock = 100;
  assert.equal(cache.get('k'), undefined);
});

test('a cached value cannot be edited through what get returns', () => {
  const cache = createCache();
  cache.set('k', { v: 1 });
  cache.get('k').v = 2;
  assert.deepEqual(cache.get('k'), { v: 1 });
});
