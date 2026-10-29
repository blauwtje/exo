import assert from 'node:assert/strict';
import test from 'node:test';
import { createCache } from '../src/cache.mjs';
import { cachedLookup } from '../src/lookup.mjs';

function clockedCache(ttlMs) {
  const clock = { time: 1000 };
  const cache = createCache({ ttlMs, now: () => clock.time });
  return { cache, clock };
}

test('an entry is live just before ttlMs', () => {
  const { cache, clock } = clockedCache(50);
  cache.set('a', 'x');
  clock.time += 49;
  assert.equal(cache.get('a'), 'x');
  assert.equal(cache.has('a'), true);
});

test('an entry is expired at exactly ttlMs', () => {
  const { cache, clock } = clockedCache(50);
  cache.set('a', 'x');
  clock.time += 50;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.has('a'), false);
});

test('size counts only live entries', () => {
  const { cache, clock } = clockedCache(50);
  cache.set('old', 1);
  clock.time += 30;
  cache.set('new', 2);
  clock.time += 30;
  assert.equal(cache.size, 1);
});

test('set on an existing key restarts its clock', () => {
  const { cache, clock } = clockedCache(50);
  cache.set('a', 1);
  clock.time += 40;
  cache.set('a', 2);
  clock.time += 40;
  assert.equal(cache.get('a'), 2);
});

test('without ttlMs nothing expires', () => {
  const clock = { time: 0 };
  const cache = createCache({ now: () => clock.time });
  cache.set('a', 1);
  clock.time += 1e12;
  assert.equal(cache.get('a'), 1);
  assert.equal(createCache().size, 0);
});

test('a stored falsy value is still found while live', () => {
  const { cache } = clockedCache(50);
  cache.set('zero', 0);
  cache.set('none', undefined);
  assert.equal(cache.has('zero'), true);
  assert.equal(cache.has('none'), true);
  assert.equal(cache.get('zero'), 0);
});

test('delete still removes an entry', () => {
  const { cache } = clockedCache(50);
  cache.set('a', 1);
  assert.equal(cache.delete('a'), true);
  assert.equal(cache.has('a'), false);
});

test('cachedLookup reloads after expiry and not before', () => {
  const { cache, clock } = clockedCache(50);
  let loads = 0;
  const load = () => ++loads;
  assert.equal(cachedLookup(cache, 'k', load), 1);
  clock.time += 10;
  assert.equal(cachedLookup(cache, 'k', load), 1);
  clock.time += 40;
  assert.equal(cachedLookup(cache, 'k', load), 2);
  assert.equal(loads, 2);
});
