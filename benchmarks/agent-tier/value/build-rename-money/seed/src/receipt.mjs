import { fmtMoney } from './money.mjs';

export function receiptTotal(items, currency) {
  const cents = items.reduce((sum, item) => sum + item.cents * item.quantity, 0);
  return `Total: ${fmtMoney(cents, currency)}`;
}
