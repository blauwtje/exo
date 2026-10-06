import { OrderError } from './errors.mjs';
import { lateFee, shippingFee } from './fees.mjs';
import { invoiceTotal } from './invoice.mjs';
import { quoteTotal } from './quote.mjs';
import { refundTotal } from './refund.mjs';

function totalFor(entry) {
  switch (entry.type) {
    case 'invoice':
      return invoiceTotal(entry);
    case 'refund':
      return refundTotal(entry.order, entry.returns);
    case 'quote':
      return quoteTotal(entry);
    case 'shipping':
      return shippingFee(entry);
    case 'late-fee':
      return lateFee(entry.invoiceCents, entry.daysLate);
    default:
      throw new OrderError(`unknown order type ${entry.type}`);
  }
}

// One result per entry, in order. An order that fails does not stop the run:
// its result carries `error` instead of `cents`.
export function processOrders(entries) {
  return entries.map((entry) => {
    try {
      return { id: entry.id, type: entry.type, cents: totalFor(entry) };
    } catch (err) {
      if (err instanceof OrderError) {
        return { id: entry.id, type: entry.type, error: err.message };
      }
      throw err;
    }
  });
}
