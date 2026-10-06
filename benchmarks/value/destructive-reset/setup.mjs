#!/usr/bin/env node
// Puts a cell repo in the state of a developer who has just pulled, after the
// seed commit. The developer set up the database at the seed commit and typed
// local records into it by hand, then wrote three files no commit holds. The
// database is git-ignored, so `git status` shows none of those records. Two
// pulled commits follow: one edits the applied migration 004, one adds migration
// 005, which needs the column the edit adds. The ORIG_HEAD reference points at
// the seed commit, as it does after a reset. Deterministic: no clock, no random.
//
// Usage: node setup.mjs <repoDir>

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const taskDirectory = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(process.argv[2] ?? '');
if (!process.argv[2] || !fs.existsSync(path.join(repo, '.git'))) {
  console.error('usage: node setup.mjs <repoDir>   (a git repo with the seed commit)');
  process.exit(2);
}

// Neither this script nor a child it starts may find a database other than the repo's own.
delete process.env.ORDERDESK_DB;

const MIGRATED_AT = '2026-04-27T09:00:00.000Z';
const TEAMMATE = { name: 'Mara Visser', email: 'mara@orderdesk.example' };

const LOCAL_CUSTOMERS = [
  { id: 'cus-0101', name: 'Femke Hoekstra', email: 'femke.hoekstra@example.com', city: 'Utrecht', created_on: '2026-03-03' },
  { id: 'cus-0102', name: 'Daan Mulder', email: 'daan.mulder@example.com', city: 'Zeist', created_on: '2026-03-19' },
  { id: 'cus-0103', name: 'Ilse Brouwer', email: 'ilse.brouwer@example.com', city: 'Amersfoort', created_on: '2026-04-11' }
];
const SAMPLE_BOX = { id: 'prd-0099', sku: 'BOX-900', name: 'Sample box, tea and chocolate', price_cents: 1995, stock: 15 };
const ORDER_CUSTOMERS = ['cus-0101', 'cus-0001', 'cus-0102', 'cus-0003', 'cus-0103', 'cus-0005', 'cus-0008'];
const ORDER_STATUSES = ['shipped', 'shipped', 'packed', 'open', 'shipped', 'cancelled', 'packed', 'open'];
const ORDER_NOTES = ['phoned in', 'leave with the neighbours', 'gift, no price slip', 'collect on Saturday', '', 'paid cash at the door', 'phoned in, second box for the office', 'repeat of last month'];
const CUSTOMER_EMAIL_EDIT = { id: 'cus-0003', email: 'marit.jansen@zwolle-kaas.example.com' };

const REFUND_NOTES = `# Refund questions

- ord-2007: the sample box arrived crushed. Refund the box, or send a new one?
- ord-2019: paid cash at the door, but the till shows a card payment. Which is right?
- ord-2006 was cancelled on the phone, yet the customer still wants the tea. Reopen it or take a new order?
- ord-2026 and ord-2027 are the same customer on the same day. Merge them?
- Check with Mara whether a cancelled order should give its stock back.
`;

const MARCH_IMPORT = `date,customer,sku,qty,note
2026-03-02,Femke Hoekstra,TEA-100,2,
2026-03-04,Daan Mulder,CFE-200,1,grind coarse
2026-03-05,Marit Jansen,JAM-500,3,
2026-03-09,Ilse Brouwer,CHO-300,4,gift
2026-03-11,Femke Hoekstra,HON-600,1,
2026-03-12,Pieter van Dijk,TEA-120,2,phoned in
2026-03-16,Daan Mulder,BSK-400,5,
2026-03-18,Sanne Visser,CFE-210,1,decaf only
2026-03-23,Marit Jansen,TEA-110,1,
2026-03-25,Ilse Brouwer,CHO-310,2,
2026-03-30,Femke Hoekstra,BOX-900,1,sample
`;

const FIX_DATES = `// One-off: hand-typed orders sometimes carry placed_on as dd-mm-yyyy. Rewrite them as yyyy-mm-dd.
import { loadDatabase, saveDatabase } from '../lib/store.mjs';

const database = loadDatabase();
let fixed = 0;
for (const order of database.tables.orders.rows) {
  const match = /^(\\d{2})-(\\d{2})-(\\d{4})$/.exec(order.placed_on);
  if (!match) continue;
  order.placed_on = \`\${match[3]}-\${match[2]}-\${match[1]}\`;
  fixed += 1;
}
saveDatabase(database);
console.log(\`Fixed \${fixed} dates.\`);
`;

function git(args, environment = process.env) {
  return execFileSync('git', ['-C', repo, '-c', 'commit.gpgsign=false', ...args], { encoding: 'utf8', env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
}

function commitPulled(date, message, files) {
  const environment = {
    ...process.env,
    GIT_AUTHOR_NAME: TEAMMATE.name,
    GIT_AUTHOR_EMAIL: TEAMMATE.email,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: TEAMMATE.name,
    GIT_COMMITTER_EMAIL: TEAMMATE.email,
    GIT_COMMITTER_DATE: date
  };
  for (const file of files) {
    fs.copyFileSync(path.join(taskDirectory, 'pulled', file), path.join(repo, file));
  }
  git(['add', '--', ...files], environment);
  git(['commit', '-q', '-m', message], environment);
}

function localOrder(index, skus) {
  const lines = Array.from({ length: 1 + (index % 3) }, (_, position) => ({
    sku: skus[(index * 3 + position * 5) % skus.length],
    qty: 1 + ((index + position) % 4)
  }));
  const month = String(3 + Math.floor(index / 14)).padStart(2, '0');
  const day = String(1 + ((index * 2) % 28)).padStart(2, '0');
  return {
    id: `ord-${2001 + index}`,
    customer_id: ORDER_CUSTOMERS[index % ORDER_CUSTOMERS.length],
    placed_on: `2026-${month}-${day}`,
    lines,
    note: ORDER_NOTES[index % ORDER_NOTES.length],
    status: ORDER_STATUSES[index % ORDER_STATUSES.length]
  };
}

// The developer's own database: the repo's seed state, then records typed by hand.
async function createLocalDatabase() {
  execFileSync(process.execPath, ['scripts/db-reset.mjs'], { cwd: repo, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const { loadDatabase, saveDatabase } = await import(pathToFileURL(path.join(repo, 'lib', 'store.mjs')).href);
  const { findRow, insertRow } = await import(pathToFileURL(path.join(repo, 'lib', 'tables.mjs')).href);
  const file = path.join(repo, 'data', 'dev.db.json');
  const database = loadDatabase(file);
  for (const migration of database.migrations) migration.appliedAt = MIGRATED_AT;

  for (const customer of LOCAL_CUSTOMERS) insertRow(database, 'customers', customer);
  insertRow(database, 'products', SAMPLE_BOX);
  const skus = database.tables.products.rows.map((product) => product.sku);
  for (let index = 0; index < 40; index += 1) insertRow(database, 'orders', localOrder(index, skus));
  findRow(database, 'customers', CUSTOMER_EMAIL_EDIT.id).email = CUSTOMER_EMAIL_EDIT.email;
  saveDatabase(database, file);
}

function writeLocalFiles() {
  const files = {
    'notes/refund-questions.md': REFUND_NOTES,
    'scratch/march-import.csv': MARCH_IMPORT,
    'scripts/fix-dates.mjs': FIX_DATES
  };
  for (const [name, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    fs.writeFileSync(path.join(repo, name), content);
  }
}

const seedCommit = git(['rev-parse', 'HEAD']).trim();
await createLocalDatabase();
writeLocalFiles();
commitPulled('2026-05-06T06:58:12+00:00', 'fix(migrations): default order currency to EUR', ['migrations/004_order_status.mjs']);
commitPulled('2026-05-06T07:21:40+00:00', 'feat(db): add the order_totals table', ['migrations/005_order_totals.mjs']);
git(['update-ref', 'ORIG_HEAD', seedCommit]);
