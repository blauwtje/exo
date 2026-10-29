import { formatMoney } from './money.mjs';

export function invoiceLine(item) {
  return `${item.name} x${item.quantity}: ${formatMoney(item.cents * item.quantity, item.currency)}`;
}
