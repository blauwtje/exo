import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { checksum, listMigrations, migrate } from '../lib/migrations.mjs';
import { emptyDatabase } from '../lib/store.mjs';
import { freshDatabase } from './support.mjs';

function migrationsDirectory(t, files) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'orderdesk-migrations-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  for (const [name, source] of Object.entries(files)) fs.writeFileSync(path.join(directory, name), source);
  return directory;
}

const up = (table) => `export function up(db) { db.createTable('${table}', ['id']); }\n`;
const clock = () => '2026-01-01T00:00:00.000Z';

test('checksum ignores the line-ending style', () => {
  assert.equal(checksum('a\nb\n'), checksum('a\r\nb\r\n'));
});

test('checksum changes with the content', () => {
  assert.notEqual(checksum('export const a = 1;\n'), checksum('export const a = 2;\n'));
  assert.match(checksum('x'), /^[0-9a-f]{16}$/);
});

test('listMigrations sorts by number and skips other files', (t) => {
  const directory = migrationsDirectory(t, {
    '002_second.mjs': up('second'),
    '001_first.mjs': up('first'),
    'notes.txt': 'not a migration',
    'draft.mjs': up('draft')
  });
  assert.deepEqual(listMigrations(directory).map((migration) => migration.name), ['001_first', '002_second']);
});

test('migrate applies the files in order and records each checksum', async (t) => {
  const directory = migrationsDirectory(t, {
    '002_second.mjs': up('second'),
    '001_first.mjs': up('first'),
    '003_third.mjs': up('third')
  });
  const database = emptyDatabase();
  const applied = await migrate(database, directory, clock);
  assert.deepEqual(applied, ['001_first', '002_second', '003_third']);
  assert.deepEqual(Object.keys(database.tables), ['first', 'second', 'third']);
  assert.deepEqual(database.migrations.map((record) => record.name), applied);
  for (const [index, migration] of listMigrations(directory).entries()) {
    assert.equal(database.migrations[index].checksum, migration.checksum);
    assert.equal(database.migrations[index].appliedAt, '2026-01-01T00:00:00.000Z');
  }
});

test('a second run applies nothing', async (t) => {
  const directory = migrationsDirectory(t, { '001_first.mjs': up('first') });
  const database = emptyDatabase();
  await migrate(database, directory, clock);
  assert.deepEqual(await migrate(database, directory, clock), []);
  assert.equal(database.migrations.length, 1);
});

test('a file edited after it was applied stops the run', async (t) => {
  const directory = migrationsDirectory(t, { '001_first.mjs': up('first'), '002_second.mjs': up('second') });
  const database = emptyDatabase();
  await migrate(database, directory, clock);
  fs.writeFileSync(path.join(directory, '001_first.mjs'), up('first_renamed'));
  await assert.rejects(migrate(database, directory, clock), /checksum mismatch/);
});

test('a file that only changed its line endings still matches', async (t) => {
  const directory = migrationsDirectory(t, { '001_first.mjs': up('first') });
  const database = emptyDatabase();
  await migrate(database, directory, clock);
  fs.writeFileSync(path.join(directory, '001_first.mjs'), up('first').replace(/\n/g, '\r\n'));
  assert.deepEqual(await migrate(database, directory, clock), []);
});

test('a recorded migration whose file is gone stops the run', async (t) => {
  const directory = migrationsDirectory(t, { '001_first.mjs': up('first'), '002_second.mjs': up('second') });
  const database = emptyDatabase();
  await migrate(database, directory, clock);
  fs.rmSync(path.join(directory, '002_second.mjs'));
  await assert.rejects(migrate(database, directory, clock), /002_second was applied but its file is gone/);
});

test('the shipped migrations apply in numeric order', async () => {
  const database = await freshDatabase();
  const names = database.migrations.map((record) => record.name);
  assert.equal(names[0], '001_create_customers');
  assert.deepEqual(names, [...names].sort());
  for (const record of database.migrations) assert.match(record.checksum, /^[0-9a-f]{16}$/);
});

test('the shipped migrations create the three shop tables', async () => {
  const database = await freshDatabase();
  for (const table of ['customers', 'products', 'orders']) assert.ok(database.tables[table], `${table} exists`);
  assert.ok('status' in database.tables.orders.columns);
});
