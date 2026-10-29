import { taxFor } from './tax.mjs';

export function invoiceTotal(order) {
  return order.netMinor + taxFor(order);
}
