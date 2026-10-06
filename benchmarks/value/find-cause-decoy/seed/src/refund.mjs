import { RefundError } from './errors.mjs';
import { withRounding } from './rounding.mjs';
import { computeTotal } from './total.mjs';

// Cents to refund for `returns` ([{ sku, qty }]) out of `order`. Rounds down.
export function refundTotal(order, returns) {
  return withRounding('floor', () => {
    const items = returns.map((ret) => {
      const line = order.items.find((item) => item.sku === ret.sku);
      if (!line) {
        throw new RefundError(`${ret.sku} was not on the order`);
      }
      if (ret.qty > line.qty) {
        throw new RefundError(
          `cannot refund ${ret.qty} of ${ret.sku}, only ${line.qty} were bought`,
        );
      }
      return { ...line, qty: ret.qty };
    });
    return computeTotal({ ...order, items }).total;
  });
}
