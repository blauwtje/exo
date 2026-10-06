import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadCustomers } from '../src/model/customers.mjs';
import { loadRates, rateFor } from '../src/model/fx.mjs';
import { writeData } from './fixture.mjs';

test('loadRates keys each rate by currency and day', () => {
  const rates = loadRates(writeData(), '2026-03');
  assert.equal(rates.get('USD:2026-03-05'), 0.92);
  assert.equal(rates.size, 3);
});

test('rateFor is 1 for the reporting currency and throws for a missing day', () => {
  const rates = loadRates(writeData(), '2026-03');
  assert.equal(rateFor(rates, 'EUR', '2026-03-05'), 1);
  assert.equal(rateFor(rates, 'USD', '2026-03-06'), 0.93);
  assert.throws(() => rateFor(rates, 'USD', '2026-03-09'), /no USD rate for 2026-03-09/);
});

test('loadCustomers reads the account time zone and billing currency', () => {
  const customers = loadCustomers(writeData());
  assert.equal(customers.get('C002').timezone, 'America/New_York');
  assert.equal(customers.get('C002').currency, 'USD');
  assert.equal(customers.get('C001').name, 'Alder Works');
});
