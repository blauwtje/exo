import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function run(...args) {
  const result = spawnSync(process.execPath, ['bin/orders.mjs', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trimEnd().split('\n');
}

test('page 4 of 47 orders offers the next page', () => {
  const lines = run('--page', '4');
  assert.ok(lines.includes('Page 4 of 5'), lines.join('\n'));
  assert.ok(lines.includes('More orders on the next page.'));
});

test('page 5 of 47 orders lists seven entries and ends the list', () => {
  const lines = run('--page', '5');
  assert.equal(lines.filter((line) => line.startsWith('#')).length, 7);
  assert.ok(lines.includes('Page 5 of 5'), lines.join('\n'));
  assert.ok(!lines.includes('More orders on the next page.'));
});

test('the last page of open orders at five a page holds one entry', () => {
  const lines = run('--status', 'open', '--page-size', '5', '--page', '4');
  assert.equal(lines.filter((line) => line.startsWith('#')).length, 1);
  assert.ok(lines.includes('Page 4 of 4'), lines.join('\n'));
});
