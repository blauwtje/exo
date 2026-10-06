// Runs one named case in this process: exit 0 = pass, 1 = fail (reason on stderr).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { handle } from '../src/api.mjs';
import { processOrders } from '../src/batch.mjs';
import { lateFee, shippingFee } from '../src/fees.mjs';
import { invoiceTotal } from '../src/invoice.mjs';
import { formatMoney, roundMoney } from '../src/money.mjs';
import { quoteTotal } from '../src/quote.mjs';
import { refundTotal } from '../src/refund.mjs';
import { refEntry, refInvoice, refLateFee, refQuote, refRefund, refShipping } from './ref.mjs';

const load = (file) => JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
const nightly = load('../data/nightly.json');
const audit = load('../data/audit.json');
const all = [...nightly, ...audit];
const ofType = (type) => all.filter((e) => e.type === type && !refEntry(e).error);
const swallow = (fn) => { try { fn(); } catch { /* the failure is the point */ } };
const expired = { placedOn: '2026-03-01', taxBps: 825, coupon: 'SPRING5', items: [{ sku: 'MUG-01', unitCents: 1499, qty: 1 }] };
const failQuote = () => swallow(() => quoteTotal(expired));
const failRefund = () => swallow(() => refundTotal(expired, [{ sku: 'MUG-01', qty: 9 }]));

const invoices = () => ofType('invoice').forEach((e) => assert.equal(invoiceTotal(e), refInvoice(e), e.id));
const fees = () => {
  for (const e of ofType('shipping')) assert.equal(shippingFee(e), refShipping(e), e.id);
  for (const e of ofType('late-fee')) assert.equal(lateFee(e.invoiceCents, e.daysLate), refLateFee(e.invoiceCents, e.daysLate), e.id);
};
const apiAll = () => {
  for (const e of all) {
    const want = refEntry(e);
    if (want.error) continue;
    const request = e.type === 'invoice' ? { type: 'invoice', order: e }
      : e.type === 'shipping' ? { type: 'shipping', order: e }
      : e.type === 'late-fee' ? { type: 'late-fee', invoiceCents: e.invoiceCents, daysLate: e.daysLate } : null;
    if (!request) continue;
    assert.deepEqual(handle(request), { status: 200, body: { totalCents: want.cents } }, e.id);
  }
};
const batch = (entries) => processOrders(entries).forEach((r, i) => {
  const want = refEntry(entries[i]);
  if (want.error) assert.ok(r.error, `${r.id} should fail`);
  else assert.equal(r.cents, want.cents, r.id);
});
const cli = (file) => {
  const entries = load(file);
  const run = spawnSync('node', ['bin/orders.mjs', new URL(file, import.meta.url).pathname], { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const lines = run.stdout.trim().split('\n');
  entries.forEach((e, i) => {
    const want = refEntry(e);
    if (want.error) assert.match(lines[i], new RegExp(`^${e.id} ${e.type} ERROR `), lines[i]);
    else assert.equal(lines[i], `${e.id} ${e.type} ${formatMoney(want.cents)}`);
  });
};

const cases = {
  'roundmoney-after-failed-quote': () => { failQuote(); assert.equal(roundMoney(1000.4), 1000); assert.equal(roundMoney(1000.2), 1000); },
  'roundmoney-after-failed-refund': () => { failRefund(); assert.equal(roundMoney(1000.5), 1001); assert.equal(roundMoney(1000.9), 1001); },
  'invoice-after-failed-quote': () => { failQuote(); invoices(); },
  'invoice-after-failed-refund': () => { failRefund(); invoices(); },
  'fees-after-failed-quote': () => { failQuote(); fees(); },
  'fees-after-failed-refund': () => { failRefund(); fees(); },
  'api-after-failed-requests': () => {
    assert.equal(handle({ type: 'quote', order: expired }).status, 422);
    assert.equal(handle({ type: 'refund', order: expired, returns: [{ sku: 'MUG-01', qty: 9 }] }).status, 422);
    apiAll();
  },
  'batch-nightly': () => batch(nightly),
  'batch-audit': () => batch(audit),
  'batch-reversed-and-rotated': () => { batch([...nightly].reverse()); batch([...audit.slice(5), ...audit.slice(0, 5)]); },
  'cli-nightly': () => cli('../data/nightly.json'),
  'cli-audit': () => cli('../data/audit.json'),
  // Must pass on the original code too: the fix may not weaken what already works.
  'standalone-totals': () => {
    for (const e of ofType('invoice')) assert.equal(invoiceTotal(e), refInvoice(e), e.id);
    for (const e of ofType('quote')) assert.equal(quoteTotal(e), refQuote(e), e.id);
    for (const e of ofType('refund')) assert.equal(refundTotal(e.order, e.returns), refRefund(e.order, e.returns), e.id);
  },
  'failures-still-reported': () => {
    assert.throws(() => invoiceTotal({ ...expired }), { name: 'CouponError' });
    assert.throws(() => quoteTotal(expired), { name: 'CouponError' });
    assert.throws(() => quoteTotal({ ...expired, coupon: undefined, items: [] }), { name: 'QuoteError' });
    assert.throws(() => refundTotal(expired, [{ sku: 'MUG-01', qty: 9 }]), { name: 'RefundError' });
    assert.equal(handle({ type: 'quote', order: expired }).status, 422);
  },
  'refund-and-quote-keep-their-modes': () => {
    for (const e of ofType('quote')) assert.equal(quoteTotal(e), refQuote(e), e.id);
    for (const e of ofType('refund')) assert.equal(refundTotal(e.order, e.returns), refRefund(e.order, e.returns), e.id);
    for (const e of ofType('invoice')) assert.equal(invoiceTotal(e), refInvoice(e), e.id);
  },
};

const name = process.argv[2];
if (name === '--list') { console.log(Object.keys(cases).join('\n')); process.exit(0); }
try { cases[name](); } catch (err) { console.error(String(err.message).split('\n')[0]); process.exit(1); }
