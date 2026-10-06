import { readDatabase, withDatabase } from '../../db/store.mjs';
import { createInvoice, getInvoice, listInvoices } from '../../services/invoices.mjs';
import { serializeInvoice } from '../serialize.mjs';

export function list({ dbPath, query }) {
  const db = readDatabase(dbPath);
  const accountId = query.get('account') ?? undefined;
  return { body: { invoices: listInvoices(db, { accountId }).map(serializeInvoice) } };
}

export function show({ dbPath, params }) {
  const db = readDatabase(dbPath);
  return { body: { invoice: serializeInvoice(getInvoice(db, params.id)) } };
}

export function create({ dbPath, body }) {
  const invoice = withDatabase(dbPath, (db) => createInvoice(db, body));
  return { status: 201, body: { invoice: serializeInvoice(invoice) } };
}
