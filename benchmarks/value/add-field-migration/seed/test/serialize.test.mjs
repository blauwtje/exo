import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeAccount, serializeInvoice } from '../src/http/serialize.mjs';

const invoice = {
  id: 'inv_4',
  number: '2026-0004',
  accountId: 'acc_2',
  status: 'open',
  issuedAt: '2026-02-01',
  dueDate: '2026-03-03',
  lines: [{ description: 'Hosting', quantity: 1, unitPriceMinor: 4900 }],
  totalMinor: 4900,
  notes: 'call before sending',
  externalRef: 'crm-881',
};

test('an invoice view carries its public fields', () => {
  const view = serializeInvoice(invoice);
  assert.equal(view.id, 'inv_4');
  assert.equal(view.number, '2026-0004');
  assert.equal(view.totalMinor, 4900);
  assert.deepEqual(view.lines, invoice.lines);
});

test('internal fields stay out of the view', () => {
  const view = serializeInvoice(invoice);
  assert.equal('notes' in view, false);
  assert.equal('externalRef' in view, false);
});

test('an account view shows the account currency', () => {
  const org = { id: 'org_default', defaultCurrency: 'EUR' };
  const view = serializeAccount({ id: 'acc_2', orgId: 'org_default', name: 'Acme', currency: 'USD' }, org);
  assert.equal(view.currency, 'USD');
  assert.equal(view.billingEmail, null);
});
