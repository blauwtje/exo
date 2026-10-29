import { inRange, monthRange } from './range.mjs';

export function statement(invoices, customerId, month) {
  const { from, to } = monthRange(month);
  const lines = invoices
    .filter((invoice) => invoice.customerId === customerId)
    .filter((invoice) => inRange(invoice.issuedAt, from, to))
    .sort((left, right) => left.issuedAt.localeCompare(right.issuedAt));
  const totalMinor = lines.reduce((sum, invoice) => sum + invoice.amountMinor, 0);
  return { customerId, month, lines, totalMinor };
}
