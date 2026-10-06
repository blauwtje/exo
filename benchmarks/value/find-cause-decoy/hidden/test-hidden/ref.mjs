// Independent reference for docs/rounding-policy.md, in exact integer arithmetic.
const COUPON_BPS = { SAVE10: 1000, VIP15: 1500, SPRING5: 500, WELCOME: 750 };
const COUPON_EXPIRES = { SAVE10: '2099-12-31', VIP15: '2099-12-31', SPRING5: '2024-05-31', WELCOME: '2099-12-31' };

function div(num, den, mode) {
  const q = Math.floor(num / den);
  const r = num - q * den;
  if (r === 0) return q;
  if (mode === 'floor') return q;
  if (mode === 'ceil') return q + 1;
  return 2 * r >= den ? q + 1 : q;
}

export function refTotal(order, mode) {
  const subtotal = order.items.reduce((s, i) => s + i.unitCents * i.qty, 0);
  const discount = order.coupon ? div(subtotal * COUPON_BPS[order.coupon], 10000, mode) : 0;
  const taxable = subtotal - discount;
  return taxable + div(taxable * order.taxBps, 10000, mode);
}

export function refInvoice(order) {
  return refTotal(order, 'half-up');
}

export function refQuote(order) {
  return refTotal(order, 'ceil');
}

export function refRefund(order, returns) {
  const items = returns.map((r) => ({ ...order.items.find((i) => i.sku === r.sku), qty: r.qty }));
  return refTotal({ ...order, items }, 'floor');
}

export function refShipping(order, mode = 'half-up') {
  return div(order.items.reduce((s, i) => s + i.unitCents * i.qty, 0) * 350, 10000, mode);
}

export function refLateFee(invoiceCents, daysLate, mode = 'half-up') {
  return div(invoiceCents * 150 * Math.ceil(daysLate / 30), 10000, mode);
}

// Expected result for one batch entry: { cents } or { error: true }.
export function refEntry(entry) {
  try {
    if (entry.type === 'invoice') {
      if (entry.coupon && !(entry.placedOn <= COUPON_EXPIRES[entry.coupon])) return { error: true };
      return { cents: refInvoice(entry) };
    }
    if (entry.type === 'quote') {
      if (entry.items.length === 0) return { error: true };
      if (entry.coupon && !(entry.placedOn <= COUPON_EXPIRES[entry.coupon])) return { error: true };
      return { cents: refQuote(entry) };
    }
    if (entry.type === 'refund') {
      for (const r of entry.returns) {
        const line = entry.order.items.find((i) => i.sku === r.sku);
        if (!line || r.qty > line.qty) return { error: true };
      }
      return { cents: refRefund(entry.order, entry.returns) };
    }
    if (entry.type === 'shipping') return { cents: refShipping(entry) };
    if (entry.type === 'late-fee') return { cents: refLateFee(entry.invoiceCents, entry.daysLate) };
  } catch {
    return { error: true };
  }
  return { error: true };
}
