import { percentOf } from './money.mjs';
import { subtotalCents } from './total.mjs';

// Shipping is 3.5% of the item subtotal.
export function shippingFee(order) {
  return percentOf(subtotalCents(order.items), 350);
}

// Late fee on an unpaid invoice: 1.5% for every started 30 days.
export function lateFee(invoiceCents, daysLate) {
  return percentOf(invoiceCents, 150 * Math.ceil(daysLate / 30));
}
