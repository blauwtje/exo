import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { scratchPath, ScratchPathError } from '../lib/scratch-path.mjs';
import { gitRepository, tempDir } from './harness.mjs';

test('a scratch path lies under the system temp folder', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const target = scratchPath(root, 'logs/run.log');
  assert.ok(target.startsWith(path.join(os.tmpdir(), `exo-${os.userInfo().username}`) + path.sep), target);
  assert.equal(path.basename(target), 'run.log');
});

test('the checkout folder is private to the user', { skip: process.platform === 'win32' }, async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const folder = scratchPath(root, '');
  assert.equal(fs.statSync(folder).mode & 0o777, 0o700);
});

test('outside a git tree the resolved folder is the root', async () => {
  const plain = await tempDir();
  const target = scratchPath(plain, 'research/x.md');
  assert.ok(target.includes(`${path.basename(plain)}-`), target);
  assert.equal(scratchPath(plain, ''), path.dirname(path.dirname(target)));
});

test('two checkouts get different scratch folders', async () => {
  const first = await gitRepository({ 'a.txt': 'a\n' });
  const second = await gitRepository({ 'a.txt': 'a\n' });
  assert.notEqual(scratchPath(first, 'logs'), scratchPath(second, 'logs'));
});

test('an absolute sub or one with .. is refused', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  assert.throws(() => scratchPath(root, '/etc/passwd'), ScratchPathError);
  assert.throws(() => scratchPath(root, '../x'), ScratchPathError);
});
