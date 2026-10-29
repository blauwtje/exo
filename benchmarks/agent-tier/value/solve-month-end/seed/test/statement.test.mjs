import assert from 'node:assert/strict';
import test from 'node:test';
import { statement } from '../src/statement.mjs';
import { monthRange } from '../src/range.mjs';

const invoices = [
  { id: 'a', customerId: 'C1', issuedAt: '2026-03-01T08:00:00Z', amountMinor: 1000 },
  { id: 'b', customerId: 'C1', issuedAt: '2026-03-15T12:30:00Z', amountMinor: 2500 },
  { id: 'c', customerId: 'C2', issuedAt: '2026-03-15T12:30:00Z', amountMinor: 999 },
  { id: 'd', customerId: 'C1', issuedAt: '2026-04-02T09:00:00Z', amountMinor: 400 }
];

test('statement lists the customer invoices of the month', () => {
  const result = statement(invoices, 'C1', '2026-03');
  assert.deepEqual(result.lines.map((line) => line.id), ['a', 'b']);
  assert.equal(result.totalMinor, 3500);
});

test('monthRange spans the first to the last day', () => {
  assert.deepEqual(monthRange('2026-03'), { from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(monthRange('2024-02'), { from: '2024-02-01', to: '2024-02-29' });
});
