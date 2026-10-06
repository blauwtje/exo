import { withDatabase } from '../../db/store.mjs';
import { createInvoice } from '../../services/invoices.mjs';

function parseLine(text) {
  const [description, quantity, unitPriceMinor] = text.split('|');
  return { description, quantity: Number(quantity), unitPriceMinor: Number(unitPriceMinor) };
}

export function run({ dbPath, values }) {
  if (!values.account) throw new Error('usage: create --account <id> --line "description|quantity|unit price in minor units"');
  const invoice = withDatabase(dbPath, (db) => createInvoice(db, {
    accountId: values.account,
    lines: (values.line ?? []).map(parseLine),
    dueDate: values.due,
    notes: values.note,
  }));
  console.log(`Created ${invoice.id} (${invoice.number})`);
}
