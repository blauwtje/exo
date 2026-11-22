import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, gitRepository, tempDir } from './harness.mjs';
import { reviewEffortLine } from '../skills/build/scripts/next-task.mjs';

const lines = (count, tag) => Array.from({ length: count }, (_, index) => `${tag} ${index}\n`).join('');

test('a file renamed into the Moved dest counts as moved, not as changed', async () => {
  const source = await fs.realpath(tempDir('exo-moved-source-'));
  await fs.writeFile(path.join(source, 'lib.js'), lines(100, 'line'));
  const root = await gitRepository({ 'old/lib.js': lines(100, 'line') });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'checkout', '-q', '-b', 'feat/rename');
  await fs.mkdir(path.join(root, 'skills/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills/app/lib.js'), lines(100, 'line').replace('line 5\n', 'edited\n'));
  git(root, 'rm', '-q', 'old/lib.js');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: rename');
  const plan = `# Plan: x\n\n## Plan basis\nRepository: /tmp/x\nBranch: feat/rename\nMoved: ${source} -> skills/app\n\n## Tasks\n`;
  assert.equal(reviewEffortLine(root, plan), 'Review effort: low (2 changed lines, 0 moved)\n');
});
