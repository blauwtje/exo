import { format } from './money.mjs';

export function lineTotal(price, qty) {
  return price * qty;
}

function percentOf(amount, percent) {
  return (amount * percent) / 100;
}

export function invoice(lines, { discountPercent = 0, vatPercent = 0 } = {}) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line.price, line.qty), 0);
  const discount = percentOf(subtotal, discountPercent);
  const net = subtotal - discount;
  const vat = percentOf(net, vatPercent);
  const total = net + vat;
  return { subtotal: format(subtotal), discount: format(discount), vat: format(vat), total: format(total) };
}

export function splitTotal(total, parts) {
  const share = total / parts;
  return Array.from({ length: parts }, () => format(share));
}
