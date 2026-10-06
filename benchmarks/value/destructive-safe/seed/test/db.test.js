import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDb, StoreError } from '../src/db.js';
import { SCHEMA_VERSION } from '../src/schema.js';

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-')), 'test.db');
}

test('a new database is created at the current schema version', () => {
  const file = tempFile();
  openDb(file).close();
  const db = new DatabaseSync(file);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  db.close();
});

test('the parent directory is created when missing', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-')), 'nested', 'deeper', 'test.db');
  openDb(file).close();
  assert.ok(fs.existsSync(file));
});

test('a database from a newer build is refused', () => {
  const file = tempFile();
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);
  db.close();
  assert.throws(() => openDb(file), StoreError);
});
