import { formatMinor, lineTotal } from '../util/money.mjs';

const SHOW_FIELDS = [
  ['Account', (invoice, account) => (account ? `${account.name} (${account.id})` : invoice.accountId)],
  ['Status', (invoice) => invoice.status],
  ['Issued', (invoice) => invoice.issuedAt],
  ['Due', (invoice) => invoice.dueDate],
  ['Currency', (invoice) => invoice.currency],
  ['Total', (invoice) => formatMinor(invoice.totalMinor)],
];

export function formatInvoice(invoice, account) {
  const rows = SHOW_FIELDS.map(([label, read]) => `  ${label.padEnd(10)}${read(invoice, account)}`);
  const lines = invoice.lines.map(
    (line) => `  ${line.quantity} x ${line.description} @ ${formatMinor(line.unitPriceMinor)} = ${formatMinor(lineTotal(line))}`,
  );
  return [`Invoice ${invoice.number} (${invoice.id})`, ...rows, 'Lines', ...lines].join('\n');
}

export function formatRow(invoice) {
  return `${invoice.id.padEnd(8)}${invoice.number.padEnd(11)}${invoice.status.padEnd(7)}${invoice.dueDate}  ${formatMinor(invoice.totalMinor).padStart(12)}`;
}
