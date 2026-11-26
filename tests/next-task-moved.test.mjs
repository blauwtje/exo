import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, gitRepository, tempDir } from './harness.mjs';
import { reviewEffortLine } from '../skills/build/scripts/next-task.mjs';

const lines = (count, tag) => Array.from({ length: count }, (_, index) => `${tag} ${index}\n`).join('');

async function movedBranch() {
  const source = await fs.realpath(tempDir('exo-moved-source-'));
  await fs.writeFile(path.join(source, 'lib.js'), lines(100, 'line'));
  const root = await gitRepository({ 'README.md': 'seed\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'checkout', '-q', '-b', 'feat/move');
  await fs.mkdir(path.join(root, 'skills/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills/app/lib.js'), lines(100, 'line').replace('line 5\n', 'edited\n'));
  await fs.writeFile(path.join(root, 'skills/app/extra.js'), lines(10, 'new'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: move');
  return { root, source };
}

const planWith = (moved) => `# Plan: x\n\n## Plan basis\nRepository: /tmp/x\nBranch: feat/move\n${moved}\n## Tasks\n`;

test('lines copied from the moved source are counted apart', async () => {
  const { root, source } = await movedBranch();
  const line = reviewEffortLine(root, planWith(`Moved: ${source} -> skills/app\n`));
  assert.equal(line, 'Review effort: medium (12 changed lines, 98 moved)\n');
});

test('without a Moved line every added line counts', async () => {
  const { root } = await movedBranch();
  assert.equal(reviewEffortLine(root, planWith('')), 'Review effort: medium (110 changed lines)\n');
});

test('a missing source keeps the full count and names the source', async () => {
  const { root } = await movedBranch();
  const line = reviewEffortLine(root, planWith('Moved: /nonexistent/old -> skills/app\n'));
  assert.equal(line, 'Review effort: medium (110 changed lines, 0 moved, moved source missing: /nonexistent/old)\n');
});
