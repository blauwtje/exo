import { couponDiscount } from './coupons.mjs';
import { percentOf } from './money.mjs';

export function subtotalCents(items) {
  return items.reduce((sum, item) => sum + item.unitCents * item.qty, 0);
}

// Subtotal, coupon discount and tax for `order`, under the current rounding mode.
export function computeTotal(order) {
  const subtotal = subtotalCents(order.items);
  const discount = order.coupon
    ? couponDiscount(order.coupon, subtotal, order.placedOn)
    : 0;
  const taxable = subtotal - discount;
  const tax = percentOf(taxable, order.taxBps);
  return { subtotal, discount, tax, total: taxable + tax };
}
