import { readDatabase } from '../../db/store.mjs';
import { getInvoice } from '../../services/invoices.mjs';
import { formatInvoice } from '../format.mjs';

export function run({ dbPath, positionals }) {
  const [id] = positionals;
  if (!id) throw new Error('usage: show <invoice id>');
  const db = readDatabase(dbPath);
  const invoice = getInvoice(db, id);
  const account = db.accounts.find((candidate) => candidate.id === invoice.accountId);
  console.log(formatInvoice(invoice, account));
}
