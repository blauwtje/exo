import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { repoState } from '../lib/repo-state.mjs';
import { gitRepository } from './harness.mjs';

test('ignoredPaths treats a path through a symlinked directory as not ignored', async () => {
  const root = await gitRepository({ 'real/f': 'x\n' });
  await fs.symlink('real', path.join(root, 'link'));
  const ignored = repoState(root).ignoredPaths(['link/f', 'real/f']);
  assert.equal(ignored.size, 0);
});
