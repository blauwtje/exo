import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregate } from '../src/export/aggregate.mjs';

const customers = new Map([
  ['C002', { id: 'C002', name: 'Birch Supply', currency: 'USD' }],
  ['C001', { id: 'C001', name: 'Alder Works', currency: 'EUR' }]
]);
const row = (customerId, amountEur) => ({ source: 'cardsvc', id: String(amountEur), customerId, amountEur });

test('totals and counts are per customer, sorted by id', () => {
  const lines = aggregate([row('C002', 100), row('C001', 50), row('C002', 25)], customers);
  assert.deepEqual(lines.map((line) => [line.customerId, line.transactions, line.totalMinor]), [['C001', 1, 50], ['C002', 2, 125]]);
  assert.equal(lines[1].customer, 'Birch Supply');
  assert.equal(lines[1].billingCurrency, 'USD');
});

test('a customer without rows has no line', () => {
  assert.deepEqual(aggregate([row('C001', 10)], customers).map((line) => line.customerId), ['C001']);
});

test('a row of an unknown customer is an error', () => {
  assert.throws(() => aggregate([row('C999', 10)], customers), /unknown customer C999/);
});
