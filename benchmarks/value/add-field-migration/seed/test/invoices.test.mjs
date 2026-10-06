import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrate } from '../src/db/migrate.mjs';
import { emptyDatabase } from '../src/db/store.mjs';
import { createInvoice, getInvoice, listInvoices } from '../src/services/invoices.mjs';

async function database() {
  const db = emptyDatabase();
  await migrate(db);
  db.accounts.push({ id: 'acc_9', orgId: 'org_default', name: 'Test Customer' });
  return db;
}

const LINES = [{ description: 'Consulting', quantity: 2, unitPriceMinor: 15000 }];

test('a new invoice totals its lines and defaults its due date', async () => {
  const db = await database();
  const invoice = createInvoice(db, { accountId: 'acc_9', lines: LINES, issuedAt: '2026-04-10' });
  assert.equal(invoice.totalMinor, 30000);
  assert.equal(invoice.dueDate, '2026-05-10');
  assert.equal(invoice.status, 'open');
  assert.equal(getInvoice(db, invoice.id), invoice);
});

test('numbers continue the sequence', async () => {
  const db = await database();
  const first = createInvoice(db, { accountId: 'acc_9', lines: LINES, issuedAt: '2026-04-10' });
  const second = createInvoice(db, { accountId: 'acc_9', lines: LINES, issuedAt: '2026-04-11' });
  assert.equal(first.id, 'inv_2');
  assert.equal(second.id, 'inv_3');
  assert.equal(second.number, '2026-0003');
});

test('an unknown account is refused', async () => {
  const db = await database();
  assert.throws(() => createInvoice(db, { accountId: 'acc_404', lines: LINES }), /does not exist/);
});

test('an invoice without lines is refused', async () => {
  const db = await database();
  assert.throws(() => createInvoice(db, { accountId: 'acc_9', lines: [] }), /at least one line/);
});

test('invoices list newest first and filter by account', async () => {
  const db = await database();
  createInvoice(db, { accountId: 'acc_9', lines: LINES, issuedAt: '2026-04-10' });
  createInvoice(db, { accountId: 'acc_9', lines: LINES, issuedAt: '2026-05-01' });
  assert.equal(listInvoices(db)[0].issuedAt, '2026-05-01');
  assert.equal(listInvoices(db, { accountId: 'acc_9' }).length, 2);
  assert.equal(listInvoices(db, { accountId: 'acc_1' }).length, 1);
});
