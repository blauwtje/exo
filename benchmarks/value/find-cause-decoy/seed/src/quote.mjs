import { QuoteError } from './errors.mjs';
import { withRounding } from './rounding.mjs';
import { computeTotal } from './total.mjs';

// Total in cents to quote for `cart`. Rounds up.
export function quoteTotal(cart) {
  return withRounding('ceil', () => {
    if (cart.items.length === 0) {
      throw new QuoteError('cannot quote an empty cart');
    }
    return computeTotal(cart).total;
  });
}
