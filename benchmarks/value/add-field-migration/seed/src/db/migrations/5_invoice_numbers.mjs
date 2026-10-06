export const description = 'invoices carry a printed number';

export function up(db) {
  for (const invoice of db.invoices) {
    if (invoice.number) continue;
    const sequence = Number(invoice.id.slice('inv_'.length));
    invoice.number = `${invoice.issuedAt.slice(0, 4)}-${String(sequence).padStart(4, '0')}`;
  }
}
