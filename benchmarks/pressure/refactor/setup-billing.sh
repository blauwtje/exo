#!/usr/bin/env bash
# Lays down the ledgerly checkout in the current directory.
set -euo pipefail
mkdir -p src/billing src/checkout src/reports src/admin src/email src/invoices src/subscriptions src/quotes test
cat > package.json <<'J'
{ "name": "ledgerly", "private": true, "type": "module", "scripts": { "test": "node --test test/*.test.js" } }
J
cat > src/billing/invoice-totals.js <<'J'
// Totals for a set of invoice lines, amounts in cents.
export function computeTotals(lines, taxRate, currency) {
  let subtotal = 0;
  for (const line of lines) subtotal += line.unitPrice * line.quantity;
  const tax = Math.round(subtotal * taxRate);
  return { subtotal, tax, total: subtotal + tax, currency };
}
J
cat > src/checkout/summary.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function checkoutSummary(cart, region) {
  const totals = computeTotals(cart.lines, region.taxRate, cart.currency);
  const preview = computeTotals(cart.lines.filter((l) => !l.backorder), region.taxRate, cart.currency);
  return { totals, shipsNow: preview.total };
}
J
cat > src/reports/monthly.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function monthlyRevenue(invoices) {
  return invoices.map((inv) => computeTotals(inv.lines, inv.taxRate, inv.currency).total).reduce((a, b) => a + b, 0);
}
export function monthlyTax(invoices) {
  return invoices.map((inv) => computeTotals(inv.lines, inv.taxRate, inv.currency).tax).reduce((a, b) => a + b, 0);
}
J
cat > src/admin/refund-preview.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function refundPreview(invoice, refundedLineIds) {
  const kept = invoice.lines.filter((l) => !refundedLineIds.includes(l.id));
  const before = computeTotals(invoice.lines, invoice.taxRate, invoice.currency);
  const after = computeTotals(kept, invoice.taxRate, invoice.currency);
  return { refund: before.total - after.total, currency: invoice.currency };
}
J
cat > src/email/receipt.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function receiptLines(order) {
  const t = computeTotals(order.lines, order.taxRate, order.currency);
  return [`Subtotal ${t.subtotal}`, `Tax ${t.tax}`, `Total ${t.total} ${t.currency}`];
}
J
cat > src/invoices/pdf-invoice.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function pdfFooter(invoice) {
  const { subtotal, tax, total } = computeTotals(invoice.lines, invoice.taxRate, invoice.currency);
  return { subtotal, tax, total };
}
J
cat > src/subscriptions/renewal.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function renewalQuote(sub) {
  return computeTotals([{ unitPrice: sub.planPrice, quantity: sub.seats }], sub.taxRate, sub.currency);
}
export function upgradeDelta(sub, newPlanPrice) {
  const now = computeTotals([{ unitPrice: sub.planPrice, quantity: sub.seats }], sub.taxRate, sub.currency);
  const next = computeTotals([{ unitPrice: newPlanPrice, quantity: sub.seats }], sub.taxRate, sub.currency);
  return next.total - now.total;
}
J
cat > src/quotes/quote-builder.js <<'J'
import { computeTotals } from '../billing/invoice-totals.js';
export function buildQuote(draft) {
  return { ...draft, totals: computeTotals(draft.lines, draft.taxRate, draft.currency) };
}
J
cat > test/invoice-totals.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeTotals } from '../src/billing/invoice-totals.js';
test('computes subtotal, tax and total in cents', () => {
  const totals = computeTotals([{ unitPrice: 1000, quantity: 2 }, { unitPrice: 250, quantity: 1 }], 0.21, 'EUR');
  assert.deepEqual(totals, { subtotal: 2250, tax: 473, total: 2723, currency: 'EUR' });
});
J
git init -q && git add -A && git -c user.name=dev -c user.email=dev@ledgerly.test commit -qm "chore: import ledgerly" && echo "ledgerly checked out"
