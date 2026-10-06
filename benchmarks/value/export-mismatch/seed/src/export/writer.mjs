import { formatCsv } from '../lib/csv.mjs';
import { formatMinor } from '../lib/money.mjs';

export const EXPORT_HEADER = ['customer_id', 'customer', 'billing_currency', 'transactions', 'total_eur'];

export function renderExport(lines) {
  return formatCsv(EXPORT_HEADER, lines.map((line) => [
    line.customerId,
    line.customer,
    line.billingCurrency,
    String(line.transactions),
    formatMinor(line.totalMinor)
  ]));
}
