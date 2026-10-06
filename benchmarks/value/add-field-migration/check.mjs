// Hidden check for value-add-field-migration. Runs the repository's real entry
// points (bin/cli.mjs and bin/serve.mjs) over a hidden database at migration 9
// and over a fresh one, and compares each invoice's currency with the one worked
// out from the fixture's accounts and organisations. Usage: node check.mjs <repoDir>
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';

const repo = path.resolve(process.argv[2] ?? '.');
const data = path.join(repo, 'check-data');
const fixture = JSON.parse(fs.readFileSync(path.join(data, 'v9.json'), 'utf8'));
const expected = JSON.parse(fs.readFileSync(path.join(data, 'expected.json'), 'utf8'));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'add-field-check-'));
const CODES = ['EUR', 'USD', 'GBP', 'SEK', 'NOK', 'CHF'];
let counter = 0;
// The whole check stays under 50 s: every child process and fetch gets at most
// the time left before this deadline, and cases that start after it are skipped.
const deadline = Date.now() + 45_000;

function budget(limit) {
  const left = deadline - Date.now();
  if (left <= 0) throw new Error('the 45 s deadline of the check passed');
  return Math.min(limit, left);
}

function freshPath() {
  counter += 1;
  return path.join(work, `db-${counter}`, 'invoicing.json');
}

function copyFixture() {
  const file = freshPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.copyFileSync(path.join(data, 'v9.json'), file);
  return file;
}

function cli(db, ...args) {
  const run = spawnSync(process.execPath, ['bin/cli.mjs', '--db', db, ...args], { cwd: repo, encoding: 'utf8', timeout: budget(15_000), killSignal: 'SIGKILL' });
  return { status: run.status, out: run.stdout ?? '', err: (run.stderr ?? '').trim().slice(-200) };
}

function migrated(db) {
  const run = cli(db, 'migrate');
  if (run.status !== 0) throw new Error(`migrate exited ${run.status}: ${run.err}`);
  return JSON.parse(fs.readFileSync(db, 'utf8'));
}

async function withServer(db, body) {
  const child = spawn(process.execPath, ['bin/serve.mjs', '--db', db, '--port', '0'], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    const base = await new Promise((resolve, reject) => {
      let seen = '';
      const timer = setTimeout(() => reject(new Error('the server printed no address in time')), budget(10_000));
      child.stdout.on('data', (chunk) => {
        seen += chunk;
        const found = /http:\/\/127\.0\.0\.1:\d+/.exec(seen);
        if (found) { clearTimeout(timer); resolve(found[0]); }
      });
      child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`the server exited ${code}`)); });
    });
    return await body(base);
  } finally {
    child.kill('SIGKILL');
  }
}

async function httpInvoice(base, id) {
  const response = await fetch(`${base}/invoices/${id}`, { signal: AbortSignal.timeout(budget(5_000)) });
  const body = await response.json();
  return body.invoice ?? {};
}

async function httpCreate(base, accountId) {
  const response = await fetch(`${base}/invoices`, {
    method: 'POST',
    signal: AbortSignal.timeout(budget(5_000)),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountId, lines: [{ description: 'Check run', quantity: 1, unitPriceMinor: 10000 }] }),
  });
  return (await response.json()).invoice?.id;
}

function showError(db, id, want) {
  const run = cli(db, 'show', id);
  if (run.status !== 0) return `show ${id} exited ${run.status}: ${run.err}`;
  const shown = CODES.filter((code) => new RegExp(`(?<![A-Z])${code}(?![A-Z])`).test(run.out));
  return isDeepStrictEqual(shown, [want]) ? null : `show ${id} prints [${shown.join(', ')}], want ${want}`;
}

const withoutCurrency = (invoices) => invoices.map(({ currency, ...rest }) => rest);
const recordNames = (db) => db.migrations.map((record) => record.name);
const wrong = (pairs) => pairs.filter(([got, want]) => got !== want);

const cases = [
  ['a database at migration 9 gets the currency of each invoice account', () => {
    const db = migrated(copyFixture());
    const bad = db.invoices.filter((invoice) => invoice.currency !== expected.invoices[invoice.id]);
    return bad.length === 0 && db.invoices.length === fixture.invoices.length
      ? null
      : `${bad.length} of ${db.invoices.length} invoices differ (${bad.slice(0, 4).map((i) => `${i.id}=${JSON.stringify(i.currency)}`).join(', ')})`;
  }],
  ['the backfill leaves every other record as it was', () => {
    const db = migrated(copyFixture());
    const { migrations: _a, invoices: _b, ...rest } = db;
    const { migrations: _c, invoices: _d, ...before } = fixture;
    if (!isDeepStrictEqual(rest, before)) return 'orgs, accounts or meta changed';
    return isDeepStrictEqual(withoutCurrency(db.invoices), fixture.invoices) ? null : 'an invoice changed besides its currency';
  }],
  ['migrations 1 to 9 keep their names and checksums', () => {
    const db = migrated(copyFixture());
    if (!isDeepStrictEqual(db.migrations.slice(0, 9).map(({ name, checksum }) => ({ name, checksum })), fixture.migrations.map(({ name, checksum }) => ({ name, checksum })))) {
      return 'the first nine records differ from the ones production holds';
    }
    const edited = fixture.migrations.filter(({ name, checksum }) => {
      const file = path.join(repo, 'src', 'db', 'migrations', `${name}.mjs`);
      return !fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== checksum;
    });
    return edited.length === 0 ? null : `edited or missing: ${edited.map((record) => record.name).join(', ')}`;
  }],
  ['a second migrate is a no-op', () => {
    const file = copyFixture();
    const first = migrated(file);
    const second = migrated(file);
    return isDeepStrictEqual(first, second) ? null : 'the second run changed the database';
  }],
  ['a fresh database applies 1 to 9 in order, then the new migration, and fills the currency of every invoice', () => {
    const db = migrated(freshPath());
    const names = recordNames(db);
    if (!isDeepStrictEqual(names.slice(0, 9), recordNames(fixture))) return `applied order starts ${names.slice(0, 11).join(', ')}`;
    if (names.length < 10) return 'no migration after 9 was applied';
    if (db.invoices.length === 0) return 'the fresh database holds no sample invoice';
    const bad = db.invoices.filter((invoice) => invoice.currency !== 'EUR');
    return bad.length === 0 ? null : `${bad.map((i) => i.id).join(', ')} lack the organisation default EUR`;
  }],
  ['GET /invoices/:id shows the right currency for every backfilled invoice', async () => {
    const file = copyFixture();
    migrated(file);
    const bad = await withServer(file, async (base) => {
      const got = await Promise.all(Object.keys(expected.invoices).map(async (id) => [(await httpInvoice(base, id)).currency, expected.invoices[id], id]));
      return wrong(got).map(([have, want, id]) => `${id}: ${JSON.stringify(have)} not ${want}`);
    });
    return bad.length === 0 ? null : bad.slice(0, 4).join('; ');
  }],
  ['show <id> prints the right currency for every backfilled invoice', () => {
    const file = copyFixture();
    migrated(file);
    const bad = Object.keys(expected.invoices).map((id) => showError(file, id, expected.invoices[id])).filter(Boolean);
    return bad.length === 0 ? null : bad.slice(0, 4).join('; ');
  }],
  ['a new invoice over HTTP defaults to its account currency in both views', async () => {
    const file = copyFixture();
    migrated(file);
    const bad = await withServer(file, async (base) => {
      const found = [];
      for (const [accountId, want] of Object.entries(expected.accounts)) {
        const id = await httpCreate(base, accountId);
        const have = id ? (await httpInvoice(base, id)).currency : 'no invoice created';
        if (have !== want) found.push(`${accountId}: ${JSON.stringify(have)} not ${want}`);
        else if (showError(file, id, want)) found.push(`${accountId}: ${showError(file, id, want)}`);
      }
      return found;
    });
    return bad.length === 0 ? null : bad.slice(0, 4).join('; ');
  }],
  ['a new invoice from the CLI defaults to its account currency in both views', async () => {
    const file = copyFixture();
    migrated(file);
    const ids = {};
    const found = [];
    for (const accountId of Object.keys(expected.accounts)) {
      const run = cli(file, 'create', '--account', accountId, '--line', 'Check run|1|10000');
      ids[accountId] = /inv_\d+/.exec(run.out)?.[0];
      if (!ids[accountId]) found.push(`create for ${accountId} exited ${run.status}: ${run.err}`);
      else if (showError(file, ids[accountId], expected.accounts[accountId])) found.push(showError(file, ids[accountId], expected.accounts[accountId]));
    }
    await withServer(file, async (base) => {
      for (const [accountId, id] of Object.entries(ids)) {
        if (id && (await httpInvoice(base, id)).currency !== expected.accounts[accountId]) found.push(`${id} over HTTP lacks ${expected.accounts[accountId]}`);
      }
    });
    return found.length === 0 ? null : found.slice(0, 4).join('; ');
  }],
  ['the sample invoice of a fresh database shows EUR in both views', async () => {
    const file = freshPath();
    const db = migrated(file);
    const id = db.invoices[0]?.id;
    if (!id) return 'the fresh database holds no invoice';
    const over = await withServer(file, async (base) => (await httpInvoice(base, id)).currency);
    if (over !== 'EUR') return `GET /invoices/${id} shows ${JSON.stringify(over)}`;
    return showError(file, id, 'EUR');
  }],
];

const detail = [];
for (const [name, run] of cases) {
  let error;
  try {
    error = Date.now() > deadline ? 'skipped, the 45 s deadline of the check passed' : await run();
  } catch (caught) {
    error = caught.message;
  }
  if (error) detail.push(`${name}: ${error}`);
}
fs.rmSync(work, { recursive: true, force: true });
console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total: cases.length, detail }));
process.exit(0);
