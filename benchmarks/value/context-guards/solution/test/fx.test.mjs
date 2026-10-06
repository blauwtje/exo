import assert from 'node:assert/strict';
import test from 'node:test';
import { createFx } from '../src/fx.mjs';

const quiet = { debug() {}, info() {}, warn() {}, error() {} };
const fx = createFx('date,currency,rate\n2026-03-06,USD,0.9\n2026-03-09,USD,0.8\n', quiet);

test('EUR is always 1', () => {
  assert.equal(fx.rateFor('EUR', '2026-03-06'), 1);
});

test('uses the rate of the day', () => {
  assert.equal(fx.rateFor('USD', '2026-03-09'), 0.8);
});

test('a weekend uses the Friday rate', () => {
  assert.equal(fx.rateFor('USD', '2026-03-07'), 0.9);
  assert.equal(fx.rateFor('USD', '2026-03-08'), 0.9);
});

test('a gap longer than a weekend still uses the latest earlier rate', () => {
  assert.equal(fx.rateFor('USD', '2026-03-14'), 0.8);
});
