import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/diagnose/scripts/bisect.mjs', import.meta.url));
const REPRO = 'test ! -f broken.txt';

test('the commit that broke the repro is named', async () => {
  const root = await gitRepository({ 'a.txt': '0' });
  await commitFiles(root, { 'a.txt': '1' }, 'feat: one');
  await commitFiles(root, { 'broken.txt': 'x' }, 'feat: breaks it');
  const culprit = git(root, 'rev-parse', '--short', 'HEAD');
  await commitFiles(root, { 'b.txt': '1' }, 'feat: after');
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.match(result.stdout.split('\n')[0], new RegExp(`^First bad: ${culprit}\\w* feat: breaks it`));
});

test('a repro that passes at HEAD reports nothing to bisect', async () => {
  const root = await gitRepository({ 'a.txt': '0' });
  const result = await run(SCRIPT, ['--repro', REPRO], { cwd: root });
  assert.match(result.stdout, /^Bisect: /);
});
