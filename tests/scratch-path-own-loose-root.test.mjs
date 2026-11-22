import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scratchPath } from '../lib/scratch-path.mjs';
import { gitRepository, tempDir } from './harness.mjs';

test('a scratch root the user owns with group or other bits is tightened and used', { skip: process.platform === 'win32' }, async (t) => {
  const previous = process.env.TMPDIR;
  process.env.TMPDIR = await tempDir();
  t.after(() => {
    if (previous === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous;
  });
  const userRoot = path.join(os.tmpdir(), `exo-${os.userInfo().username}`);
  fs.mkdirSync(userRoot);
  fs.chmodSync(userRoot, 0o755);
  const checkout = await gitRepository({ 'a.txt': 'a\n' });
  const folder = scratchPath(checkout, '');
  assert.ok(fs.statSync(folder).isDirectory());
  assert.equal(fs.statSync(userRoot).mode & 0o777, 0o700);
});
