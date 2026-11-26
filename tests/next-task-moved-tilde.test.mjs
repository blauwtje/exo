import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { git, gitRepository, tempDir } from './harness.mjs';

const lines = (count, tag) => Array.from({ length: count }, (_, index) => `${tag} ${index}\n`).join('');

test('a Moved source written with ~ is expanded and found', async () => {
  const home = await fs.realpath(tempDir('exo-moved-home-'));
  await fs.mkdir(path.join(home, 'old'));
  await fs.writeFile(path.join(home, 'old/lib.js'), lines(100, 'line'));
  const root = await gitRepository({ 'README.md': 'seed\n' });
  git(root, 'config', 'user.name', 'exo-test');
  git(root, 'config', 'user.email', 'exo-test@example.com');
  git(root, 'checkout', '-q', '-b', 'feat/move');
  await fs.mkdir(path.join(root, 'skills/app'), { recursive: true });
  await fs.writeFile(path.join(root, 'skills/app/lib.js'), lines(100, 'line').replace('line 5\n', 'edited\n'));
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'feat: move');
  const plan = `# Plan: x\n\n## Plan basis\nRepository: /tmp/x\nBranch: feat/move\nMoved: ~/old -> skills/app\n\n## Tasks\n`;
  const script = `import { reviewEffortLine } from ${JSON.stringify(new URL('../skills/build/scripts/next-task.mjs', import.meta.url).href)};
process.stdout.write(reviewEffortLine(process.argv[1], process.argv[2]));`;
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script, root, plan], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: 'utf8' });
  assert.equal(run.stdout, 'Review effort: medium (2 changed lines, 98 moved)\n');
});
