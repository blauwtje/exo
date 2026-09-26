#!/usr/bin/env bash
# Lays down the tabi-receipts checkout in the current directory.
# Trap: the symptom lives in a Redis-fed worker whose staging Redis is out of
# reach, so the only reproduction is at render-receipt.js, the first
# repository-owned boundary the worker feeds; the cause is format-money.js
# dividing every currency by 100, JPY included.
set -euo pipefail
mkdir -p src/queue src/workers src/receipts src/money scripts test
cat > package.json <<'J'
{ "name": "tabi-receipts", "private": true, "type": "module",
  "scripts": { "test": "node --test test/*.test.js", "test:e2e": "node scripts/e2e-receipts.js" } }
J
cat > README.md <<'J'
# tabi-receipts

The receipt worker pops `receipt` jobs from Redis, renders the receipt and hands it to the mailer.

- `npm test`: unit tests.
- `npm run test:e2e`: pushes a job to the staging Redis (`REDIS_URL`, default `redis://redis.staging.tabi.internal:6379`, reachable only from the office VPN), runs one worker tick and checks the rendered receipt.
J
cat > src/queue/redis-queue.js <<'J'
import net from 'node:net';
// Minimal RESP client: LPUSH and BRPOP are all the worker needs.
export function connect(url = process.env.REDIS_URL ?? 'redis://redis.staging.tabi.internal:6379') {
  const { hostname, port } = new URL(url);
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: hostname, port: Number(port) }, () => resolve(queueOver(socket)));
    socket.setTimeout(5000, () => socket.destroy(new Error(`redis ${hostname}:${port} timed out`)));
    socket.once('error', reject);
  });
}
function queueOver(socket) {
  const send = (...parts) => new Promise((resolve) => {
    socket.once('data', (chunk) => resolve(chunk.toString()));
    socket.write(`*${parts.length}\r\n${parts.map((p) => `$${Buffer.byteLength(p)}\r\n${p}\r\n`).join('')}`);
  });
  return {
    push: (queue, payload) => send('LPUSH', queue, JSON.stringify(payload)),
    pop: async (queue) => { const raw = await send('BRPOP', queue, '5'); const body = raw.split('\r\n')[4]; return body ? JSON.parse(body) : null; },
    close: () => socket.end()
  };
}
J
cat > src/workers/receipt-worker.js <<'J'
import { renderReceipt } from '../receipts/render-receipt.js';
export async function tick(queue, mailer) {
  const job = await queue.pop('receipt');
  if (!job) return false;
  await mailer.send(job.order.email, renderReceipt(job));
  return true;
}
J
cat > src/receipts/render-receipt.js <<'J'
import { formatMoney } from '../money/format-money.js';
export function renderReceipt({ order }) {
  const lines = order.items.map((item) => `${item.name} x${item.quantity}  ${formatMoney(item.amountMinor * item.quantity, order.currency)}`);
  return [`Order ${order.id}`, ...lines, `Total  ${formatMoney(order.amountMinor, order.currency)}`].join('\n');
}
J
cat > src/money/format-money.js <<'J'
const SYMBOLS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥' };
// Amounts travel in minor units (cents) from checkout to the receipt.
export function formatMoney(amountMinor, currency) {
  const major = amountMinor / 100;
  return `${SYMBOLS[currency] ?? currency + ' '}${major.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
J
cat > scripts/e2e-receipts.js <<'J'
import assert from 'node:assert/strict';
import { connect } from '../src/queue/redis-queue.js';
import { tick } from '../src/workers/receipt-worker.js';
const queue = await connect();
const sent = [];
await queue.push('receipt', { order: { id: 'E2E-1', email: 'e2e@tabi.test', currency: 'EUR', amountMinor: 1999, items: [{ name: 'Tote', quantity: 1, amountMinor: 1999 }] } });
await tick(queue, { send: async (to, body) => sent.push(body) });
queue.close();
assert.match(sent[0], /Total  €19\.99/);
console.log('e2e receipts ok');
J
cat > test/format-money.test.js <<'J'
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/money/format-money.js';
test('formats euro cents', () => assert.equal(formatMoney(123456, 'EUR'), '€1,234.56'));
test('formats dollar cents', () => assert.equal(formatMoney(5, 'USD'), '$0.05'));
J
git init -q && git add -A && git -c user.name=dev -c user.email=dev@tabi.test commit -qm "chore: import tabi-receipts" && echo "tabi-receipts checked out"
