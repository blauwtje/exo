import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, gitRepository, tempDir } from './harness.mjs';
import { reviewEffortLine } from '../skills/build/scripts/next-task.mjs';

const lines = (count, tag) => Array.from({ length: count }, (_, index) => `${tag} ${index}\n`).join('');

test('a git diff failure on a moved destination keeps the full count', async () => {
  const source = await fs.realpath(tempDir('exo-moved-error-source-'));
  await fs.writeFile(path.join(source, 'lib.js'), lines(10, 'old'));
  const root = await gitRepository({ 'README.md': 'seed\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'checkout', '-q', '-b', 'feat/move');
  await fs.mkdir(path.join(root, 'skills/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills/app/lib.js'), lines(200, 'new'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: move');
  await fs.rm(path.join(root, 'skills/app'), { recursive: true });
  const plan = `# Plan: x\n\n## Plan basis\nRepository: /tmp/x\nBranch: feat/move\nMoved: ${source} -> skills/app\n\n## Tasks\n`;
  const line = reviewEffortLine(root, plan);
  assert.match(line, /^Review effort: medium \(200 changed lines/);
});
