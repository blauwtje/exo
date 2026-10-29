import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache } from '../src/cache.mjs';
import { cachedLookup } from '../src/lookup.mjs';

test('set then get', () => {
  const cache = createCache();
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);
  assert.equal(cache.size, 1);
});

test('cachedLookup loads once', () => {
  const cache = createCache();
  let loads = 0;
  const load = () => ++loads;
  assert.equal(cachedLookup(cache, 'k', load), 1);
  assert.equal(cachedLookup(cache, 'k', load), 1);
  assert.equal(loads, 1);
});
