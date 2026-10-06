import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const BIN = path.join(import.meta.dirname, '..', 'bin', 'stockroom.js');
const SKUS = ['E2E-ADD', 'E2E-ADJ', 'E2E-LOW', 'E2E-RM'];
// Never the developer's own database.
const ENV = { ...process.env, STOCKROOM_DB: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stockroom-e2e-')), 'e2e.db') };

function stockroom(...args) {
  const result = spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

after(() => {
  for (const sku of SKUS) spawnSync(process.execPath, [BIN, 'remove', '--sku', sku], { env: ENV });
});

test('add puts an item on the list', () => {
  stockroom('add', '--sku', 'E2E-ADD', '--name', 'Test widget', '--qty', '5');
  assert.match(stockroom('list'), /E2E-ADD\s+Test widget\s+5/);
});

test('adjust changes the quantity', () => {
  stockroom('add', '--sku', 'E2E-ADJ', '--name', 'Adjustable', '--qty', '5');
  stockroom('adjust', '--sku', 'E2E-ADJ', '--by=-2');
  assert.match(stockroom('list'), /E2E-ADJ\s+Adjustable\s+3/);
});

test('low lists an item at its reorder point', () => {
  stockroom('add', '--sku', 'E2E-LOW', '--name', 'Running out', '--qty', '2', '--reorder-at', '2');
  assert.match(stockroom('low'), /E2E-LOW/);
});

test('remove takes the item off the list', () => {
  stockroom('add', '--sku', 'E2E-RM', '--name', 'Short lived');
  stockroom('remove', '--sku', 'E2E-RM');
  assert.doesNotMatch(stockroom('list'), /E2E-RM/);
});
