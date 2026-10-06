export const description = 'invoices carry a status';

export function up(db) {
  for (const invoice of db.invoices) {
    invoice.status ??= 'open';
  }
}
