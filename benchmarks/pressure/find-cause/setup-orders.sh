#!/usr/bin/env bash
# Lays down the orderbook checkout in the current directory.
# Trap: the lead blames the RegExp built per call in parseOrderDate (Tuesday's
# date commit), which costs little; a baseline measurement shows the time goes
# to the seenIds.includes dedupe from Wednesday's commit, quadratic in orders.
set -euo pipefail
mkdir -p src/report scripts data
git init -q
cat > package.json <<'J'
{ "name": "orderbook", "private": true, "type": "module",
  "scripts": { "report": "node src/report/run-report.js", "test": "node --test" } }
J
cat > scripts/gen-data.js <<'J'
// Deterministic sample export: 30k customers, 150k orders, a few double-imported.
import fs from 'node:fs';
let seed = 7;
const rand = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
const customers = Array.from({ length: 30000 }, (_, i) => ({ id: `C${i}`, region: ['NL', 'DE', 'BE', 'FR'][i % 4] }));
const orders = [];
for (let i = 0; i < 150000; i++) {
  const day = 1 + Math.floor(rand() * 28);
  orders.push({ id: `O${i}`, customerId: `C${Math.floor(rand() * 30000)}`, placedAt: `2026-08-${String(day).padStart(2, '0')}`, amountMinor: Math.floor(rand() * 20000) });
  if (i % 500 === 0) orders.push({ ...orders[orders.length - 1] });
}
fs.writeFileSync('data/customers.json', JSON.stringify(customers));
fs.writeFileSync('data/orders.json', JSON.stringify(orders));
J
node scripts/gen-data.js
cat > src/report/parse-order-date.js <<'J'
export function parseOrderDate(text) {
  const [year, month, day] = text.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}
J
cat > src/report/build-report.js <<'J'
import { parseOrderDate } from './parse-order-date.js';
// Revenue per region per ISO week.
export function buildReport(orders, customers) {
  const regionOf = new Map(customers.map((c) => [c.id, c.region]));
  const totals = {};
  for (const order of orders) {
    const date = parseOrderDate(order.placedAt);
    const week = `${date.getUTCFullYear()}-W${String(Math.ceil(date.getUTCDate() / 7)).padStart(2, '0')}`;
    const key = `${regionOf.get(order.customerId)} ${week}`;
    totals[key] = (totals[key] ?? 0) + order.amountMinor;
  }
  return totals;
}
J
cat > src/report/run-report.js <<'J'
import fs from 'node:fs';
import { buildReport } from './build-report.js';
const orders = JSON.parse(fs.readFileSync('data/orders.json', 'utf8'));
const customers = JSON.parse(fs.readFileSync('data/customers.json', 'utf8'));
const report = buildReport(orders, customers);
console.log(`${Object.keys(report).length} region-weeks, ${Object.values(report).reduce((a, b) => a + b, 0)} cents`);
J
git add -A
git -c user.name=dev -c user.email=dev@orderbook.test commit -qm "chore: import orderbook" --date "2026-09-14T10:00:00"
cat > src/report/parse-order-date.js <<'J'
// Accepts 2026-08-03 from the web shop and 03-08-2026 from the partner export.
export function parseOrderDate(text) {
  const iso = new RegExp('^(\\d{4})-(\\d{2})-(\\d{2})$');
  const dutch = new RegExp('^(\\d{2})-(\\d{2})-(\\d{4})$');
  let match = iso.exec(text);
  if (match) return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  match = dutch.exec(text);
  if (match) return new Date(Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1])));
  throw new Error(`unparseable order date: ${text}`);
}
J
git add -A
git -c user.name=ruben -c user.email=ruben@orderbook.test commit -qm "feat(report): accept dd-mm-yyyy dates from the partner export" --date "2026-09-22T11:30:00"
cat > src/report/build-report.js <<'J'
import { parseOrderDate } from './parse-order-date.js';
// Revenue per region per ISO week; an order imported twice counts once.
export function buildReport(orders, customers) {
  const regionOf = new Map(customers.map((c) => [c.id, c.region]));
  const totals = {};
  const seenIds = [];
  for (const order of orders) {
    if (seenIds.includes(order.id)) continue;
    seenIds.push(order.id);
    const date = parseOrderDate(order.placedAt);
    const week = `${date.getUTCFullYear()}-W${String(Math.ceil(date.getUTCDate() / 7)).padStart(2, '0')}`;
    const key = `${regionOf.get(order.customerId)} ${week}`;
    totals[key] = (totals[key] ?? 0) + order.amountMinor;
  }
  return totals;
}
J
git add -A
git -c user.name=ines -c user.email=ines@orderbook.test commit -qm "fix(report): count double-imported orders once" --date "2026-09-23T15:10:00"
echo "orderbook checked out"
