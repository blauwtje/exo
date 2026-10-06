export const description = 'a single amount becomes a list of lines';

export function up(db) {
  for (const invoice of db.invoices) {
    if (invoice.lines || invoice.amountMinor === undefined) continue;
    invoice.lines = [{
      description: invoice.description ?? 'Services',
      quantity: 1,
      unitPriceMinor: invoice.amountMinor,
    }];
    invoice.totalMinor = invoice.amountMinor;
    delete invoice.amountMinor;
    delete invoice.description;
  }
}
