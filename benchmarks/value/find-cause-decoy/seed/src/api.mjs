import { OrderError } from './errors.mjs';
import { lateFee, shippingFee } from './fees.mjs';
import { invoiceTotal } from './invoice.mjs';
import { quoteTotal } from './quote.mjs';
import { refundTotal } from './refund.mjs';

// Handles one storefront request and answers { status, body }.
export function handle(request) {
  try {
    switch (request.type) {
      case 'invoice':
        return { status: 200, body: { totalCents: invoiceTotal(request.order) } };
      case 'refund':
        return {
          status: 200,
          body: { totalCents: refundTotal(request.order, request.returns) },
        };
      case 'quote':
        return { status: 200, body: { totalCents: quoteTotal(request.order) } };
      case 'shipping':
        return { status: 200, body: { totalCents: shippingFee(request.order) } };
      case 'late-fee':
        return {
          status: 200,
          body: { totalCents: lateFee(request.invoiceCents, request.daysLate) },
        };
      default:
        return { status: 400, body: { error: `unknown request type ${request.type}` } };
    }
  } catch (err) {
    if (err instanceof OrderError) {
      return { status: 422, body: { error: err.message } };
    }
    throw err;
  }
}
