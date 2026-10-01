// return-to-default.mjs puts the main checkout back on the default branch and
// fast-forwards it after a branch's work lands, against a real bare origin
// that a second clone moves ahead, so the pull has something to bring in.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';
import { returnToDefault } from '../skills/ship/scripts/return-to-default.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/ship/scripts/return-to-default.mjs', import.meta.url));

// A checkout on feat/x cloned from a bare origin whose main has since moved
// one commit ahead of it, the way it stands right after a merge.
async function mergedRepository() {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const root = await fs.realpath(await fixture());
  const origin = path.join(root, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const workDir = path.join(root, 'work');
  const otherDir = path.join(root, 'other');
  execFileSync('git', ['clone', '-q', origin, workDir]);
  execFileSync('git', ['clone', '-q', origin, otherDir]);
  await commitFiles(otherDir, { 'merged.txt': 'merged\n' }, 'feat: x (#42)');
  git(otherDir, 'push', '-q', 'origin', 'HEAD:main');
  git(workDir, 'checkout', '-q', '-b', 'feat/x');
  await commitFiles(workDir, { 'feature.txt': 'x\n' }, 'feat: add feature');
  return { root, workDir, mergedHead: git(otherDir, 'rev-parse', 'HEAD') };
}

test('a checkout on the merged branch switches to main and pulls it', async () => {
  const { workDir, mergedHead } = await mergedRepository();
  await fs.writeFile(path.join(workDir, 'notes.txt'), 'untracked\n');
  const outcome = returnToDefault({ dir: workDir, merged: ['feat/x'] });
  assert.deepEqual(outcome, { pulled: true, line: `${workDir} on main, pulled` });
  assert.equal(git(workDir, 'branch', '--show-current'), 'main');
  assert.equal(git(workDir, 'rev-parse', 'HEAD'), mergedHead);
});

test('from a linked worktree it moves the main checkout and names its path', async () => {
  const { root, workDir, mergedHead } = await mergedRepository();
  const linked = path.join(root, 'linked');
  git(workDir, 'worktree', 'add', '-q', '-b', 'feat/y', linked, 'HEAD');
  const outcome = returnToDefault({ dir: linked, merged: ['feat/x', 'feat/y'] });
  assert.equal(outcome.line, `${workDir} on main, pulled`);
  assert.equal(git(workDir, 'rev-parse', 'HEAD'), mergedHead);
  assert.equal(git(linked, 'branch', '--show-current'), 'feat/y');
});

test('a checkout on a branch that did not merge stays where it is', async () => {
  const { workDir } = await mergedRepository();
  const outcome = returnToDefault({ dir: workDir, merged: ['feat/other'] });
  assert.deepEqual(outcome, { pulled: false, line: `${workDir} stays on feat/x: not a merged branch` });
  assert.equal(git(workDir, 'branch', '--show-current'), 'feat/x');
});

test('a tracked change keeps the checkout on its branch, untouched', async () => {
  const { workDir } = await mergedRepository();
  await fs.writeFile(path.join(workDir, 'feature.txt'), 'edited\n');
  const outcome = returnToDefault({ dir: workDir, merged: ['feat/x'] });
  assert.deepEqual(outcome, { pulled: false, line: `${workDir} stays on feat/x: uncommitted changes` });
  assert.equal(git(workDir, 'branch', '--show-current'), 'feat/x');
  assert.equal(await fs.readFile(path.join(workDir, 'feature.txt'), 'utf8'), 'edited\n');
});

test('a main that cannot fast-forward is reported and keeps its own commit', async () => {
  const { workDir } = await mergedRepository();
  git(workDir, 'checkout', '-q', 'main');
  await commitFiles(workDir, { 'local.txt': 'local\n' }, 'chore: local only');
  const localHead = git(workDir, 'rev-parse', 'HEAD');
  const outcome = returnToDefault({ dir: workDir });
  assert.equal(outcome.pulled, false);
  assert.match(outcome.line, new RegExp(`^${workDir} on main, not pulled: `));
  assert.equal(git(workDir, 'rev-parse', 'HEAD'), localHead);
});

test('the command exits 0 after a pull, 1 when it leaves the checkout, 2 on a bad flag', async () => {
  const { workDir } = await mergedRepository();
  const stays = await run(SCRIPT, [], { cwd: workDir });
  assert.deepEqual([stays.code, stays.stdout], [1, `${workDir} stays on feat/x: not a merged branch\n`]);
  const pulled = await run(SCRIPT, ['--merged', 'feat/x'], { cwd: workDir });
  assert.deepEqual([pulled.code, pulled.stdout], [0, `${workDir} on main, pulled\n`]);
  const usage = await run(SCRIPT, ['--merged'], { cwd: workDir });
  assert.deepEqual([usage.code, usage.stdout], [2, '']);
});
