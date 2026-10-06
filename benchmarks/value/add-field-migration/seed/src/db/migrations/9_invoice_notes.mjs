export const description = 'internal notes and an external reference on every invoice';

export function up(db) {
  for (const invoice of db.invoices) {
    invoice.notes ??= null;
    invoice.externalRef ??= null;
  }
}
