import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { migrate } from '../src/db/migrate.mjs';
import { emptyDatabase } from '../src/db/store.mjs';

function migrationsDir(sources) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerline-migrations-'));
  for (const [name, body] of Object.entries(sources)) fs.writeFileSync(path.join(dir, name), body);
  return dir;
}

const TRAIL = (label) => `export function up(db) { (db.trail ??= []).push('${label}'); }\n`;

test('applies pending migrations in order and records each name with a checksum', async () => {
  const dir = migrationsDir({ '1_a.mjs': TRAIL('a'), '2_b.mjs': TRAIL('b'), '3_c.mjs': TRAIL('c') });
  const db = emptyDatabase();
  const ran = await migrate(db, { dir });
  assert.deepEqual(ran, ['1_a', '2_b', '3_c']);
  assert.deepEqual(db.trail, ['a', 'b', 'c']);
  assert.deepEqual(db.migrations.map((record) => record.name), ['1_a', '2_b', '3_c']);
  assert.match(db.migrations[0].checksum, /^[0-9a-f]{64}$/);
});

test('a second run applies nothing', async () => {
  const dir = migrationsDir({ '1_a.mjs': TRAIL('a'), '2_b.mjs': TRAIL('b') });
  const db = emptyDatabase();
  await migrate(db, { dir });
  const before = structuredClone(db);
  assert.deepEqual(await migrate(db, { dir }), []);
  assert.deepEqual(db, before);
});

test('a migration edited after it was applied stops the run', async () => {
  const dir = migrationsDir({ '1_a.mjs': TRAIL('a') });
  const db = emptyDatabase();
  await migrate(db, { dir });
  fs.writeFileSync(path.join(dir, '1_a.mjs'), TRAIL('changed'));
  await assert.rejects(migrate(db, { dir }), /changed after it was applied/);
});

test('the shipped migrations build the current invoice shape on an empty database', async () => {
  const db = emptyDatabase();
  await migrate(db);
  assert.equal(db.migrations.length, 10);
  assert.equal(db.migrations.at(-1).name, '10_invoice_currency');
  assert.equal(db.orgs[0].id, 'org_default');
  const [invoice] = db.invoices;
  assert.equal(invoice.lines.length, 1);
  assert.equal(invoice.totalMinor, 12500);
  assert.equal(invoice.dueDate, '2026-02-01');
  assert.equal(invoice.amountMinor, undefined);
  assert.equal(invoice.currency, 'EUR');
});
