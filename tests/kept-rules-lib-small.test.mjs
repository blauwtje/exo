import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { exportSignatures } from '../lib/export-signatures.mjs';
import { readLayer } from '../lib/settings-store.mjs';

test('settings store: a missing layer file is empty, a broken or non-object one throws', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-layer-'));
  try {
    assert.deepEqual(readLayer(path.join(dir, 'none.json')), {});
    const broken = path.join(dir, 'broken.json');
    fs.writeFileSync(broken, '{ nope');
    assert.throws(() => readLayer(broken), /not valid JSON/);
    const list = path.join(dir, 'list.json');
    fs.writeFileSync(list, '[]');
    assert.throws(() => readLayer(list), /not a JSON object/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('export signatures: a commented-out export is not read, a comment in a list is dropped', () => {
  const found = exportSignatures('// export function gone(a) {}\nexport function kept(a, /* b */ c = 1, ...rest) {}\n');
  assert.deepEqual([...found.keys()], ['kept']);
  assert.equal(found.get('kept').total, 3);
  assert.equal(found.get('kept').required, 1);
  assert.equal(found.get('kept').hasRest, true);
});
