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

const VICTIM = 'victim.test.sh';
const POLLUTION_REPRO = `for f in __FILE__; do sh "$f"; done; sh ${VICTIM}`;

async function suiteRepository(polluter) {
  const files = { [VICTIM]: 'test ! -f marker\n' };
  for (const name of ['a', 'b', 'c', 'd']) files[`${name}.test.sh`] = name === polluter ? 'touch marker\n' : 'true\n';
  return gitRepository(files);
}

test('the test file that makes the victim fail is named', async () => {
  const root = await suiteRepository('c');
  const result = await run(SCRIPT, ['--repro', POLLUTION_REPRO], { cwd: root });
  assert.equal(result.stdout.trim(), 'Polluter: c.test.sh');
});

test('a victim that fails alone exits 1', async () => {
  const root = await gitRepository({ [VICTIM]: 'false\n', 'a.test.sh': 'true\n' });
  const result = await run(SCRIPT, ['--repro', POLLUTION_REPRO], { cwd: root });
  assert.equal(result.stdout.trim(), 'Bisect: the test fails alone');
  assert.equal(result.code, 1);
});

test('a clean set prints Polluter: none', async () => {
  const root = await suiteRepository(null);
  const result = await run(SCRIPT, ['--repro', POLLUTION_REPRO], { cwd: root });
  assert.equal(result.stdout.trim(), 'Polluter: none');
});

test('a polluter in a test folder without a test name is named', async () => {
  const root = await gitRepository({ [VICTIM]: 'test ! -f marker\n', 'tests/a.sh': 'true\n', 'tests/c.sh': 'touch marker\n' });
  const result = await run(SCRIPT, ['--repro', POLLUTION_REPRO], { cwd: root });
  assert.equal(result.stdout.trim(), 'Polluter: tests/c.sh');
});
