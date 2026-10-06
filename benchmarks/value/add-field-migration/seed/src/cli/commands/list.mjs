import { readDatabase } from '../../db/store.mjs';
import { listInvoices } from '../../services/invoices.mjs';
import { formatRow } from '../format.mjs';

export function run({ dbPath, values }) {
  const db = readDatabase(dbPath);
  const invoices = listInvoices(db, { accountId: values.account });
  if (invoices.length === 0) console.log('No invoices.');
  for (const invoice of invoices) console.log(formatRow(invoice));
}
