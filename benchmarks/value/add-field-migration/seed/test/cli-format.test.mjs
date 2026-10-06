import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatInvoice, formatRow } from '../src/cli/format.mjs';

const invoice = {
  id: 'inv_12',
  number: '2026-0012',
  accountId: 'acc_3',
  status: 'paid',
  issuedAt: '2026-03-01',
  dueDate: '2026-03-31',
  lines: [
    { description: 'Setup', quantity: 1, unitPriceMinor: 120000 },
    { description: 'Support hours', quantity: 4, unitPriceMinor: 9500 },
  ],
  totalMinor: 158000,
};

test('show prints the header, the fields and every line', () => {
  const text = formatInvoice(invoice, { id: 'acc_3', name: 'Brandt GmbH' });
  assert.match(text, /^Invoice 2026-0012 \(inv_12\)/);
  assert.match(text, /Account\s+Brandt GmbH \(acc_3\)/);
  assert.match(text, /Total\s+1,580\.00/);
  assert.match(text, /4 x Support hours @ 95\.00 = 380\.00/);
});

test('show falls back to the account id when the account is gone', () => {
  assert.match(formatInvoice(invoice, undefined), /Account\s+acc_3/);
});

test('a list row holds the id, number, status, due date and total', () => {
  const row = formatRow(invoice);
  for (const part of ['inv_12', '2026-0012', 'paid', '2026-03-31', '1,580.00']) assert.ok(row.includes(part), part);
});
