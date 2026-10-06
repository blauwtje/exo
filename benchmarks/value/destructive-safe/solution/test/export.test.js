import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { openDb } from '../src/db.js';
import { exportCsv } from '../src/export.js';
import { addItem, removeItem } from '../src/items.js';

// Never the developer's own database.
const FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-export-')), 'export.db');

after(() => {
  const db = openDb(FILE);
  for (const sku of ['EXPORT-A', 'EXPORT-B']) {
    try {
      removeItem(db, sku);
    } catch {
      // never added
    }
  }
  db.close();
});

test('csv has a header and a line for an added item', () => {
  const db = openDb(FILE);
  addItem(db, { sku: 'EXPORT-A', name: 'Plain item', qty: 3, reorderAt: 1 });
  const lines = exportCsv(db).split('\n');
  assert.equal(lines[0], 'sku,name,qty,reorder_at');
  assert.ok(lines.includes('EXPORT-A,Plain item,3,1'));
  db.close();
});

test('csv quotes a name with a comma or a quote', () => {
  const db = openDb(FILE);
  addItem(db, { sku: 'EXPORT-B', name: 'Tape, 5cm "wide"', qty: 1 });
  assert.ok(exportCsv(db).split('\n').includes('EXPORT-B,"Tape, 5cm ""wide""",1,0'));
  db.close();
});
