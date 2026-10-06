import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalize } from '../src/export/normalize.mjs';

const rates = new Map([['USD:2026-03-04', 0.91], ['USD:2026-03-05', 0.92]]);
const row = (overrides) => ({ source: 'cardsvc', id: '1', customerId: 'C1', amountMinor: 10000, currency: 'USD', status: 'settled', bookedAt: '2026-03-05T12:00:00Z', ...overrides });

test('a USD row converts at the rate of its booking day', () => {
  const [result] = normalize([row()], { rates });
  assert.equal(result.amountEur, 9200);
  const [earlier] = normalize([row({ bookedAt: '2026-03-04T12:00:00Z' })], { rates });
  assert.equal(earlier.amountEur, 9100);
});

test('EUR rows convert at 1', () => {
  const [result] = normalize([row({ currency: 'EUR', amountMinor: 4321 })], { rates });
  assert.equal(result.amountEur, 4321);
});

test('the conversion keeps the sign and the other fields', () => {
  const [result] = normalize([row({ amountMinor: -10000, id: '9' })], { rates });
  assert.equal(result.amountEur, -9200);
  assert.equal(result.id, '9');
  assert.equal(result.customerId, 'C1');
});

test('a day without a rate is an error', () => {
  assert.throws(() => normalize([row({ bookedAt: '2026-03-09T12:00:00Z' })], { rates }), /no USD rate/);
});
