import { CouponError } from './errors.mjs';
import { percentOf } from './money.mjs';

const COUPONS = {
  SAVE10: { percentBps: 1000, expires: '2099-12-31' },
  VIP15: { percentBps: 1500, expires: '2099-12-31' },
  SPRING5: { percentBps: 500, expires: '2024-05-31' },
  WELCOME: { percentBps: 750, expires: '2099-12-31' },
};

// Discount in cents for `code` on `baseCents`, as of the order date `placedOn`
// (YYYY-MM-DD). Throws CouponError for an unknown or expired code.
export function couponDiscount(code, baseCents, placedOn) {
  const coupon = COUPONS[code];
  if (!coupon) {
    throw new CouponError(`unknown coupon ${code}`);
  }
  if (placedOn > coupon.expires) {
    throw new CouponError(`coupon ${code} expired on ${coupon.expires}`);
  }
  return percentOf(baseCents, coupon.percentBps);
}
