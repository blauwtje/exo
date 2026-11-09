import assert from 'node:assert/strict';
import test from 'node:test';
import { countsCost, isPeak, usageCost } from '../benchmarks/pricing.mjs';

const COUNTS = { input: 1000000, cacheRead: 2000000, cache5m: 0, cache1h: 0, output: 500000 };
const OFF_PEAK = 1 * 0.15 + 2 * 0.003 + 0.5 * 0.6;

test('deepseek-flash prices hit, miss and output tokens at its list rates', () => {
  assert.ok(Math.abs(countsCost(COUNTS, 'deepseek-flash') - OFF_PEAK) < 1e-9);
});

test('a peak start doubles the deepseek-flash cost', () => {
  assert.ok(Math.abs(countsCost(COUNTS, 'deepseek-flash', { peak: true }) - 2 * OFF_PEAK) < 1e-9);
  assert.equal(countsCost(COUNTS, 'claude-opus-5', { peak: true }), countsCost(COUNTS, 'claude-opus-5'));
});

test('peak hours are 01:00-04:00 and 06:00-10:00 UTC on weekdays', () => {
  assert.equal(isPeak(Date.UTC(2026, 10, 9, 9, 22)), true);
  assert.equal(isPeak(Date.UTC(2026, 10, 9, 2, 0)), true);
  assert.equal(isPeak(Date.UTC(2026, 10, 9, 5, 0)), false);
  assert.equal(isPeak(Date.UTC(2026, 10, 9, 10, 0)), false);
  assert.equal(isPeak(Date.UTC(2026, 10, 8, 9, 0)), false);
});

test('usageCost prices a record from usage by model at the start time and reports hit and miss tokens', () => {
  const figures = usageCost({ 'deepseek-flash': COUNTS }, Date.UTC(2026, 10, 9, 9, 0));
  assert.ok(Math.abs(figures.costUsd - 2 * OFF_PEAK) < 1e-9);
  assert.equal(figures.cacheHitTokens, 2000000);
  assert.equal(figures.cacheMissTokens, 1000000);
});
