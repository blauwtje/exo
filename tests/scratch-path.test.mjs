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

test('a scratch call removes sibling folders older than the keep limit', async (t) => {
  const previous = process.env.TMPDIR;
  const isolated = await tempDir();
  process.env.TMPDIR = isolated;
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  });
  const userRoot = path.join(os.tmpdir(), `exo-${os.userInfo().username}`);
  const old = path.join(userRoot, 'old-folder');
  const fresh = path.join(userRoot, 'fresh-folder');
  fs.mkdirSync(userRoot, { mode: 0o700 });
  fs.mkdirSync(old);
  fs.mkdirSync(fresh);
  const eightDaysAgo = new Date(0);
  fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const current = scratchPath(root, '');
  fs.utimesSync(current, eightDaysAgo, eightDaysAgo);
  scratchPath(root, '');
  assert.equal(fs.existsSync(old), false);
  assert.equal(fs.existsSync(fresh), true);
  assert.equal(fs.existsSync(current), true);
});

test('a scratch root that is a symlink is refused', { skip: process.platform === 'win32' }, async (t) => {
  const previous = process.env.TMPDIR;
  const isolated = await tempDir();
  process.env.TMPDIR = isolated;
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  });
  const userRoot = path.join(os.tmpdir(), `exo-${os.userInfo().username}`);
  fs.symlinkSync(await tempDir(), userRoot);
  const root = await gitRepository({ 'a.txt': 'a\n' });
  assert.throws(() => scratchPath(root, ''), (error) => error instanceof ScratchPathError && error.message.includes(userRoot));
});
