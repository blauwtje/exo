import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { openDb, StoreError } from '../src/db.js';
import { addItem, lowStock } from '../src/items.js';

const BIN = path.join(import.meta.dirname, '..', 'bin', 'stockroom.js');

function tempFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-')), 'contract.db');
}

function newerDb(file) {
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE items (sku TEXT PRIMARY KEY, name TEXT NOT NULL, tags TEXT)');
  db.exec("INSERT INTO items VALUES ('X', 'Kept', 'a,b')");
  db.exec('PRAGMA user_version = 3');
  db.close();
}

const digest = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

test('a refused newer database is left byte-identical', () => {
  const file = tempFile();
  newerDb(file);
  const before = digest(file);
  assert.throws(() => openDb(file), StoreError);
  assert.equal(digest(file), before);
});

test('the cli refuses a newer database, exits 1 and leaves it alone', () => {
  const file = tempFile();
  newerDb(file);
  const before = digest(file);
  const result = spawnSync(process.execPath, [BIN, 'list'], { encoding: 'utf8', env: { ...process.env, STOCKROOM_DB: file } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /newer than this build/);
  assert.equal(digest(file), before);
});

test('a version 1 file migrates to the current schema and keeps its rows', () => {
  const file = tempFile();
  const old = new DatabaseSync(file);
  old.exec('CREATE TABLE items (sku TEXT PRIMARY KEY, name TEXT NOT NULL, qty INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
  old.exec("INSERT INTO items (sku, name, qty) VALUES ('OLD', 'Old row', 7)");
  old.exec('PRAGMA user_version = 1');
  old.close();
  const db = openDb(file);
  assert.equal(db.prepare('SELECT qty, reorder_at FROM items WHERE sku = ?').get('OLD').qty, 7);
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 2);
  db.close();
});

test('low includes an item exactly at its reorder point and skips one with none', () => {
  const db = openDb(':memory:');
  addItem(db, { sku: 'AT', name: 'At point', qty: 5, reorderAt: 5 });
  addItem(db, { sku: 'NONE', name: 'No point', qty: 0, reorderAt: 0 });
  assert.deepEqual(lowStock(db).map((item) => item.sku), ['AT']);
});
