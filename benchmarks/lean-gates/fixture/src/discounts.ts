import { divideHalfEven, type Cents } from './money.ts';

// An order-level discount: a share of the subtotal in basis points
// (1000 = 10%) or a fixed amount.
export type Discount =
  | { readonly kind: 'percent'; readonly basisPoints: number }
  | { readonly kind: 'fixed'; readonly cents: Cents };

// The discount on a subtotal, never more than the subtotal itself.
export function discountCents(subtotalCents: Cents, discount: Discount | undefined): Cents {
  if (discount === undefined) return 0;
  const amount = discount.kind === 'percent'
    ? divideHalfEven(subtotalCents * discount.basisPoints, 10_000)
    : discount.cents;
  return Math.min(Math.max(amount, 0), subtotalCents);
}
