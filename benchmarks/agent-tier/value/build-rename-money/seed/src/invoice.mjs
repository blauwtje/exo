import { fmtMoney } from './money.mjs';

export function invoiceLine(item) {
  return `${item.name} x${item.quantity}: ${fmtMoney(item.cents * item.quantity, item.currency)}`;
}
