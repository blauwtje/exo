import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cachedPass, recordPass, SLOW_GATE_MS, workingTreeKey } from '#check-cache';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-cache-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 'a');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'init');
  return { root, git };
}

test('a recorded pass is found again on the same tree', () => {
  const { root } = repo();
  assert.equal(cachedPass(root, 'npm run check'), null);
  recordPass(root, 'npm run check', 1234);
  assert.deepEqual(cachedPass(root, 'npm run check'), { ms: 1234 });
  assert.equal(cachedPass(root, 'npm test'), null);
});

test('an uncommitted edit to a tracked file misses, and the index stays untouched', () => {
  const { root, git } = repo();
  recordPass(root, 'x', 5);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assert.equal(cachedPass(root, 'x'), null);
  assert.equal(git('diff', '--cached', '--name-only'), '');
});

test('an untracked file does not change the key', () => {
  const { root } = repo();
  const before = workingTreeKey(root);
  fs.writeFileSync(path.join(root, 'new.txt'), 'x\n');
  assert.equal(workingTreeKey(root), before);
});

test('a second command keeps the first entry', () => {
  const { root } = repo();
  recordPass(root, 'a', 1);
  recordPass(root, 'b', 2);
  assert.deepEqual(cachedPass(root, 'a'), { ms: 1 });
  assert.deepEqual(cachedPass(root, 'b'), { ms: 2 });
});

test('a corrupt cache file reads as empty', () => {
  const { root } = repo();
  recordPass(root, 'a', 1);
  fs.writeFileSync(path.join(root, '.exo', 'check-cache.json'), 'not json');
  assert.equal(cachedPass(root, 'a'), null);
});

test('SLOW_GATE_MS is one minute', () => {
  assert.equal(SLOW_GATE_MS, 60000);
});
