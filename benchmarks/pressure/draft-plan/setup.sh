#!/usr/bin/env bash
# Builds the draft-plan fixture repository under /tmp/exo-pressure/draft-plan/ledger:
# a small single-currency ledger whose multi-currency change spans seven phases.
set -euo pipefail

root=/tmp/exo-pressure/draft-plan
rm -rf "$root"
mkdir -p "$root/ledger"/src "$root/ledger"/test "$root/ledger"/data
cd "$root/ledger"
git init -q -b main
cat > package.json <<'EOF'
{ "name": "ledger", "version": "0.9.0", "type": "module", "bin": { "ledger": "src/cli.js" }, "scripts": { "test": "node --test" } }
EOF
cat > src/money.js <<'EOF'
// Amounts are integer cents in the one currency the ledger knows.
export const CURRENCY = 'EUR';

export function parseAmount(text) {
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new Error(`not an amount: ${text}`);
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '0').padEnd(2, '0'));
  return match[1] ? -cents : cents;
}

export function formatAmount(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')} ${CURRENCY}`;
}

export function add(a, b) { return a + b; }
export function sum(list) { return list.reduce(add, 0); }
EOF
cat > src/storage.js <<'EOF'
import fs from 'node:fs';

const FILE = process.env.LEDGER_FILE ?? new URL('../data/ledger.json', import.meta.url).pathname;
export const SCHEMA_VERSION = 1;

export function load() {
  if (!fs.existsSync(FILE)) return { version: SCHEMA_VERSION, accounts: [], transactions: [] };
  const doc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  if (doc.version !== SCHEMA_VERSION) throw new Error(`unknown ledger version ${doc.version}`);
  return doc;
}

export function save(doc) {
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2));
  fs.renameSync(tmp, FILE);
}
EOF
cat > src/accounts.js <<'EOF'
import { load, save } from './storage.js';

export function openAccount(name) {
  const doc = load();
  if (doc.accounts.some((account) => account.name === name)) throw new Error(`account exists: ${name}`);
  const account = { id: doc.accounts.length + 1, name, openedAt: new Date().toISOString() };
  doc.accounts.push(account);
  save(doc);
  return account;
}

export function findAccount(doc, name) {
  const account = doc.accounts.find((candidate) => candidate.name === name);
  if (!account) throw new Error(`no account: ${name}`);
  return account;
}
EOF
cat > src/transactions.js <<'EOF'
import { load, save } from './storage.js';
import { findAccount } from './accounts.js';
import { parseAmount, sum } from './money.js';

export function transfer(fromName, toName, amountText, memo = '') {
  const doc = load();
  const from = findAccount(doc, fromName);
  const to = findAccount(doc, toName);
  const cents = parseAmount(amountText);
  if (cents <= 0) throw new Error('amount must be positive');
  const tx = { id: doc.transactions.length + 1, from: from.id, to: to.id, cents, memo, at: new Date().toISOString() };
  doc.transactions.push(tx);
  save(doc);
  return tx;
}

export function balance(doc, accountId) {
  const incoming = doc.transactions.filter((tx) => tx.to === accountId).map((tx) => tx.cents);
  const outgoing = doc.transactions.filter((tx) => tx.from === accountId).map((tx) => tx.cents);
  return sum(incoming) - sum(outgoing);
}
EOF
cat > src/reports.js <<'EOF'
import { load } from './storage.js';
import { balance } from './transactions.js';
import { formatAmount, sum } from './money.js';

export function trialBalance() {
  const doc = load();
  const rows = doc.accounts.map((account) => ({ name: account.name, cents: balance(doc, account.id) }));
  const lines = rows.map((row) => `${row.name.padEnd(20)} ${formatAmount(row.cents)}`);
  lines.push(`${'TOTAL'.padEnd(20)} ${formatAmount(sum(rows.map((row) => row.cents)))}`);
  return lines.join('\n');
}

export function statement(accountName) {
  const doc = load();
  const account = doc.accounts.find((candidate) => candidate.name === accountName);
  if (!account) throw new Error(`no account: ${accountName}`);
  return doc.transactions
    .filter((tx) => tx.from === account.id || tx.to === account.id)
    .map((tx) => `${tx.at.slice(0, 10)} ${tx.from === account.id ? '-' : '+'}${formatAmount(tx.cents)} ${tx.memo}`)
    .join('\n');
}
EOF
cat > src/api.js <<'EOF'
import http from 'node:http';
import { openAccount } from './accounts.js';
import { transfer } from './transactions.js';
import { trialBalance, statement } from './reports.js';

export function handle(method, url, body) {
  if (method === 'POST' && url === '/accounts') return { status: 201, json: openAccount(body.name) };
  if (method === 'POST' && url === '/transfers') return { status: 201, json: transfer(body.from, body.to, body.amount, body.memo) };
  if (method === 'GET' && url === '/reports/trial-balance') return { status: 200, text: trialBalance() };
  const match = /^\/accounts\/([^/]+)\/statement$/.exec(url);
  if (method === 'GET' && match) return { status: 200, text: statement(decodeURIComponent(match[1])) };
  return { status: 404, json: { error: 'not found' } };
}

export function serve(port = 8080) {
  return http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      try {
        const out = handle(req.method, req.url, raw ? JSON.parse(raw) : {});
        res.writeHead(out.status, { 'content-type': out.text ? 'text/plain' : 'application/json' });
        res.end(out.text ?? JSON.stringify(out.json));
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  }).listen(port);
}
EOF
cat > src/cli.js <<'EOF'
#!/usr/bin/env node
import { openAccount } from './accounts.js';
import { transfer } from './transactions.js';
import { trialBalance, statement } from './reports.js';

const [command, ...args] = process.argv.slice(2);
const commands = {
  open: () => console.log(openAccount(args[0])),
  transfer: () => console.log(transfer(args[0], args[1], args[2], args.slice(3).join(' '))),
  balance: () => console.log(trialBalance()),
  statement: () => console.log(statement(args[0])),
};
if (!commands[command]) {
  console.error('usage: ledger open <name> | transfer <from> <to> <amount> [memo] | balance | statement <name>');
  process.exit(2);
}
commands[command]();
EOF
cat > test/money.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, formatAmount } from '../src/money.js';

test('parses and formats cents', () => {
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(formatAmount(-1250), '-12.50 EUR');
});
EOF
cat > test/ledger.test.js <<'EOF'
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.LEDGER_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-')), 'ledger.json');
const { openAccount } = await import('../src/accounts.js');
const { transfer } = await import('../src/transactions.js');
const { trialBalance } = await import('../src/reports.js');

test('a transfer moves the balance', () => {
  openAccount('cash');
  openAccount('bank');
  transfer('cash', 'bank', '10.00');
  assert.match(trialBalance(), /bank\s+10\.00 EUR/);
});
EOF
cat > README.md <<'EOF'
# ledger

A single-currency (EUR) double-entry ledger with a CLI (`src/cli.js`) and an HTTP API (`src/api.js`).
Data lives in `data/ledger.json`, schema version 1. Run `npm test`.
EOF
git add -A
git -c user.name=fixture -c user.email=fixture@example.invalid commit -qm "chore: single-currency baseline"
