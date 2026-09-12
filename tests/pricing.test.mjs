// pricing.mjs prices usage counts at a model's list price in prices.mjs, each
// count at its own rate, and never guesses a price it does not have.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countsCost, modelPrice } from '../skills/savings/scripts/pricing.mjs';

test('a dated model id prices as its longest listed family', () => {
  assert.deepEqual(modelPrice('claude-haiku-4-5-20251001'), { input: 1, output: 5, cacheRead: 0.1, cache5m: 1.25, cache1h: 2 });
  assert.equal(modelPrice('claude-unlisted-9'), null);
  assert.equal(modelPrice(undefined), null);
});

test('each count is priced at its own rate, a negative count as a credit', () => {
  // Fable 5.1 reads cache at $0.25 per million, a fortieth of its $10 input rate.
  const counts = { input: 1000, cacheRead: 1000000, cache5m: 0, cache1h: 1000, output: -100 };
  const expected = (1000 * 10 + 1000000 * 0.25 + 1000 * 20 - 100 * 50) / 1e6;
  assert.ok(Math.abs(countsCost(counts, 'claude-fable-5-1') - expected) < 1e-12);
});

test('an unlisted model prices non-zero counts as unknown and zero counts as nothing', () => {
  assert.equal(countsCost({ input: 1 }, 'claude-unlisted-9'), null);
  assert.equal(countsCost({ input: 0, output: 0 }, '<synthetic>'), 0);
});

test('Fable 5 prices its cache reads at its own rate, apart from Fable 5.1', () => {
  assert.equal(modelPrice('claude-fable-5').cacheRead, 1);
  assert.equal(modelPrice('claude-fable-5-1').cacheRead, 0.25);
  assert.deepEqual(modelPrice('claude-opus-4-7'), { input: 5, output: 25, cacheRead: 0.5, cache5m: 6.25, cache1h: 10 });
  assert.deepEqual(modelPrice('claude-sonnet-4-5-20250929'), { input: 3, output: 15, cacheRead: 0.3, cache5m: 3.75, cache1h: 6 });
});
