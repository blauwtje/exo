import { computeTotal } from './total.mjs';

// Total in cents the customer is charged. Rounds half-up (the default mode).
export function invoiceTotal(order) {
  return computeTotal(order).total;
}
