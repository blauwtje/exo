import { append, buildHistory, edit } from '../lib/history.mjs';

const dest = process.argv[2];
if (!dest) throw new Error('usage: node build.mjs <dest>');

const CORE = 'src/invoice.mjs';

const invoice = `export function taxFor(cents, ratePercent) {
  return Math.round((cents * ratePercent) / 100)
}

export function lineTotal(item) {
  const net = item.cents * item.qty
  return net + taxFor(net, item.taxRate ?? 0)
}

export function invoiceTotal(items) {
  return items.reduce((total, item) => total + lineTotal(item), 0)
}
`;

const repro = `import assert from 'node:assert/strict'
import { invoiceTotal } from '../src/invoice.mjs'

assert.equal(invoiceTotal([{ cents: 1000, qty: 2, taxRate: 10 }]), 2200)
assert.equal(invoiceTotal([{ cents: 1999, qty: 1, taxRate: 7.5 }]), 2149)
console.log('invoice ok')
`;

buildHistory(dest, {
  name: 'invoice-tax',
  seed: 67,
  count: 230,
  base: {
    'README.md': '# invoice-tax\n\nTotals invoice lines in integer cents, tax included.\n',
    [CORE]: invoice,
    'test/invoice.mjs': repro,
  },
  core: {
    file: CORE,
    renames: [['withShipping', 'addShipping'], ['applyDiscount', 'discounted'], ['taxTotal', 'totalTax'], ['creditNote', 'refundTotal']],
    tweaks: [
      { subject: 'feat: export the default tax rate', append: 'export const DEFAULT_TAX_RATE = 0' },
      { subject: 'feat: export the invoice currency', append: "export const CURRENCY = 'EUR'" },
      { subject: 'feat: export the maximum quantity', append: 'export const MAX_QTY = 999' },
    ],
  },
  steps: [
    {
      at: 0.05,
      subject: 'feat: add discounts',
      apply: (files) => append(files, CORE, '\nexport function applyDiscount(cents, percent) {\n  return cents - Math.round((cents * percent) / 100)\n}\n'),
    },
    {
      at: 0.15,
      subject: 'feat: add a shipping line',
      apply: (files) => append(files, CORE, '\nexport function withShipping(total, shippingCents) {\n  return total + shippingCents\n}\n'),
    },
    {
      at: 0.28,
      subject: 'refactor: extract netFor',
      apply: (files) => {
        edit(files, CORE, 'const net = item.cents * item.qty', 'const net = netFor(item)');
        append(files, CORE, '\nexport function netFor(item) {\n  return item.cents * item.qty\n}\n');
      },
    },
    {
      at: 0.34,
      subject: 'feat: support free items',
      apply: (files) => edit(files, CORE, 'return item.cents * item.qty', 'return item.free ? 0 : item.cents * item.qty'),
    },
    {
      at: 0.4,
      subject: 'chore: use integer helpers for money',
      culprit: true,
      apply: (files) => edit(files, CORE, 'Math.round((cents * ratePercent) / 100)', 'Math.trunc((cents * ratePercent) / 100)'),
    },
    {
      at: 0.47,
      subject: 'refactor: name the percent divisor',
      apply: (files) => {
        edit(files, CORE, 'export function taxFor', 'const PERCENT = 100\n\nexport function taxFor');
        edit(files, CORE, 'Math.trunc((cents * ratePercent) / 100)', 'Math.trunc((cents * ratePercent) / PERCENT)');
      },
    },
    {
      at: 0.62,
      subject: 'feat: format money for display',
      apply: (files) => append(files, CORE, '\nexport function formatMoney(cents) {\n  return `$${(cents / 100).toFixed(2)}`\n}\n'),
    },
    {
      at: 0.7,
      subject: 'feat: add a tax total',
      apply: (files) => append(files, CORE, '\nexport function taxTotal(items) {\n  return items.reduce((total, item) => total + taxFor(netFor(item), item.taxRate ?? 0), 0)\n}\n'),
    },
    {
      at: 0.8,
      subject: 'fix: ignore negative quantities',
      apply: (files) => edit(files, CORE, 'item.cents * item.qty', 'item.cents * Math.max(item.qty, 0)'),
    },
    {
      at: 0.9,
      subject: 'feat: add credit notes',
      apply: (files) => append(files, CORE, '\nexport function creditNote(items) {\n  return -invoiceTotal(items)\n}\n'),
    },
  ],
});
