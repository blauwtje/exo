import { formatCents, percentOfCents, toCents } from './money.mjs';

export function lineTotal(price, qty) {
  return toCents(price) * qty;
}

export function invoice(lines, { discountPercent = 0, vatPercent = 0 } = {}) {
  const subtotal = lines.reduce((sum, line) => sum + lineTotal(line.price, line.qty), 0);
  const discount = percentOfCents(subtotal, discountPercent);
  const net = subtotal - discount;
  const vat = percentOfCents(net, vatPercent);
  const total = net + vat;
  return { subtotal: formatCents(subtotal), discount: formatCents(discount), vat: formatCents(vat), total: formatCents(total) };
}

export function splitTotal(total, parts) {
  const cents = toCents(total);
  const base = Math.floor(cents / parts);
  const extra = cents - base * parts;
  return Array.from({ length: parts }, (_, index) => formatCents(base + (index < extra ? 1 : 0)));
}
