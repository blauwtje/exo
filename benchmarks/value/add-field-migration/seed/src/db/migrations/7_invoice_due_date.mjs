import { addDays } from '../../util/dates.mjs';

export const description = 'invoices carry a due date';

export function up(db) {
  for (const invoice of db.invoices) {
    invoice.dueDate ??= addDays(invoice.issuedAt, 30);
  }
}
