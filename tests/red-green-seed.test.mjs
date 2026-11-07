import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { runOnBase } from '../lib/red-green.mjs';
import { gitRepository } from './harness.mjs';

test('red-green tree keeps the node_modules the worktree seed made', async () => {
  const root = await gitRepository({ 'package-lock.json': '{}\n', '.gitignore': 'node_modules\n' });
  await fs.promises.mkdir(path.join(root, 'node_modules'));
  await fs.promises.writeFile(path.join(root, 'node_modules', 'dep.txt'), 'x');
  const result = runOnBase({ root, base: 'HEAD', command: 'test -f node_modules/dep.txt', timeoutMs: 30000 });
  assert.equal(result.status, 'green', result.output);
});
