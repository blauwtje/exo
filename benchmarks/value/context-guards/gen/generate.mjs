#!/usr/bin/env node
// Builds the seed's March 2026 data deterministically and writes the expected
// totals, computed here from the true amounts and not from the report code, to
// hidden/check-data/march-expected.json. Run: node gen/generate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let state = 20260331;
function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const randn = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
const pick = (list) => list[Math.floor(rand() * list.length)];
const DAY = 86_400_000;
const day = (n) => new Date(Date.UTC(2026, 2, 1) + n * DAY).toISOString().slice(0, 10);
const isWeekend = (date) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

// Merchants: M001-M040 exported plain amounts all month; M041-M060 joined on
// 2026-03-14 and export accounting style (thousands separators, (x) refunds).
const CURRENCY_A = { 3: 'USD', 5: 'GBP', 7: 'SEK', 9: 'NOK' };
const CURRENCY_B = { 0: 'NOK', 2: 'USD' };
const merchants = [];
for (let i = 1; i <= 60; i++) {
  const group = i <= 40 ? 'A' : 'B';
  const currency = group === 'A' ? (CURRENCY_A[i % 10] ?? 'EUR') : (CURRENCY_B[i % 4] ?? 'EUR');
  merchants.push({
    id: `M${String(i).padStart(3, '0')}`,
    name: `Merchant ${String(i).padStart(3, '0')}`,
    onboarded: group === 'A' ? '2026-01-15' : '2026-03-14',
    currency,
    group,
  });
}

const cents = (value) => Math.round(value * 100);
const plain = (value) => (cents(value) / 100).toFixed(2);
const grouped = (value) => (cents(value) / 100).toLocaleString('en-US', { minimumFractionDigits: 2 });
const csvField = (text) => (/[",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

const dated = [];
for (let n = 0; n < 5000; n++) {
  let date;
  do date = day(Math.floor(rand() * 31));
  while (isWeekend(date) && rand() < 0.6);
  dated.push(date);
}
dated.sort();

const rows = [];
dated.forEach((date, index) => {
  const eligible = merchants.filter((m) => m.onboarded <= date);
  const merchant = pick(eligible);
  let value = Math.min(99999.99, Math.max(0.5, Math.exp(4.8 + 1.5 * randn())));
  value = cents(value) / 100;
  const refund = rand() < (merchant.group === 'A' ? 0.03 : 0.06);
  const signed = refund ? -value : value;
  const roll = rand();
  const status = roll < 0.88 ? 'settled' : roll < 0.96 ? 'pending' : 'failed';
  let text;
  if (merchant.group === 'A') text = refund ? `-${plain(value)}` : plain(value);
  else {
    const body = value >= 1000 ? grouped(value) : plain(value);
    text = refund ? `(${body})` : body;
  }
  rows.push({
    txn_id: `T${String(index + 1).padStart(6, '0')}`,
    date,
    merchant_id: merchant.id,
    amount: text,
    currency: merchant.currency,
    status,
    signed,
  });
});
const withDuplicates = [];
for (const row of rows) {
  withDuplicates.push(row);
  if (rand() < 0.02) withDuplicates.push({ ...row });
}

// Rates: weekdays 2026-02-27 .. 2026-03-31; NOK is not published 03-17 .. 03-20.
const rates = [];
const level = { USD: 0.92, GBP: 1.17, SEK: 0.088, NOK: 0.086 };
for (let n = -2; n <= 30; n++) {
  const date = day(n);
  if (isWeekend(date)) continue;
  for (const currency of Object.keys(level)) {
    level[currency] *= 1 + (rand() - 0.5) * 0.006;
    if (currency === 'NOK' && date >= '2026-03-17' && date <= '2026-03-20') continue;
    rates.push({ date, currency, rate: level[currency].toFixed(5) });
  }
}

// Expected report: first row of a txn_id, settled, true signed amount, latest
// rate on or before the row's date.
const rateOn = (currency, date) => {
  if (currency === 'EUR') return 1;
  const candidates = rates.filter((r) => r.currency === currency && r.date <= date);
  return Number(candidates[candidates.length - 1].rate);
};
const seen = new Set();
const expected = { total_minor: 0, merchants: {}, counted: 0 };
for (const row of withDuplicates) {
  if (seen.has(row.txn_id)) continue;
  seen.add(row.txn_id);
  if (row.status !== 'settled') continue;
  const eur = Math.round(cents(row.signed) * rateOn(row.currency, row.date));
  expected.total_minor += eur;
  expected.merchants[row.merchant_id] = (expected.merchants[row.merchant_id] ?? 0) + eur;
  expected.counted++;
}
expected.merchants = Object.fromEntries(Object.entries(expected.merchants).sort());

const write = (file, text) => fs.writeFileSync(path.join(root, file), text);
write(
  'seed/data/transactions-2026-03.csv',
  `txn_id,date,merchant_id,amount,currency,status\n${withDuplicates
    .map((r) => [r.txn_id, r.date, r.merchant_id, csvField(r.amount), r.currency, r.status].join(','))
    .join('\n')}\n`,
);
write('seed/data/fx-2026-03.csv', `date,currency,rate\n${rates.map((r) => `${r.date},${r.currency},${r.rate}`).join('\n')}\n`);
write(
  'seed/data/merchants.csv',
  `merchant_id,name,onboarded\n${merchants.map((m) => `${m.id},${m.name},${m.onboarded}`).join('\n')}\n`,
);
write('hidden/check-data/march-expected.json', `${JSON.stringify(expected, null, 2)}\n`);
console.log(`rows=${withDuplicates.length} counted=${expected.counted} total_minor=${expected.total_minor}`);
