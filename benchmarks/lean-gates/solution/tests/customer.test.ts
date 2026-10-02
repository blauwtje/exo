import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCustomer, dueDate } from '../src/customer.ts';

const ACME = createCustomer({ id: 'c-1', name: 'Acme BV', taxExempt: false, paymentTermsDays: 30 });

test('dueDate adds the payment terms to the order date', () => {
  assert.equal(dueDate('2024-03-01', ACME), '2024-03-31');
  assert.equal(dueDate('2024-12-15', ACME), '2025-01-14');
  assert.equal(dueDate('2024-02-01', { ...ACME, paymentTermsDays: 29 }), '2024-03-01');
});

test('createCustomer refuses terms outside 0 to 120 days', () => {
  assert.throws(() => createCustomer({ ...ACME, paymentTermsDays: -1 }), RangeError);
  assert.throws(() => createCustomer({ ...ACME, paymentTermsDays: 121 }), RangeError);
  assert.throws(() => createCustomer({ ...ACME, paymentTermsDays: 7.5 }), RangeError);
});
