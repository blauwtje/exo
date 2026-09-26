// finish-run.mjs ends a run-plan session's step 7 tail: the merge-base with
// origin/<default>, pick-reviewer.mjs run on it, and the run-plan.active
// marker removed once the reviewer is picked.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { commitFiles, fixture, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/run-plan/scripts/finish-run.mjs', import.meta.url));

// A repository on `main`, cloned from a bare `origin` the way a real checkout
// would be, so `refs/remotes/origin/HEAD` and the merge-base are real.
async function checkoutRepository() {
  const seed = await gitRepository({ 'README.md': '# fixture\n' });
  const bareRoot = await fixture();
  const origin = path.join(bareRoot, 'origin.git');
  execFileSync('git', ['clone', '-q', '--bare', seed, origin]);
  const cloneRoot = await fs.realpath(await fixture());
  const workDir = path.join(cloneRoot, 'work');
  execFileSync('git', ['clone', '-q', origin, workDir]);
  return workDir;
}

async function writeMarker(root) {
  const markerPath = path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'run-plan.active');
  await fs.mkdir(path.dirname(markerPath), { recursive: true });
  await fs.writeFile(markerPath, `${path.join(root, 'plan.md')}\n${root}\nsess-1\n${new Date().toISOString()}\n`);
  return markerPath;
}

test('takes the merge-base and prints the pick-reviewer line plus a base= line, leaving the marker', async () => {
  const root = await checkoutRepository();
  await commitFiles(root, { 'src/app.js': 'export const greet = () => "hi";\n' }, 'feat(app): greet');
  const markerPath = await writeMarker(root);
  const base = git(root, 'merge-base', 'HEAD', 'origin/main');

  const result = await run(SCRIPT, ['--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.deepEqual(result.stdout.trim().split('\n'), ['exo:review-branch', `base=${base}`]);
  await fs.access(markerPath);
});

test('--done removes the marker and prints nothing', async () => {
  const root = await checkoutRepository();
  await commitFiles(root, { 'src/app.js': 'export const greet = () => "hi";\n' }, 'feat(app): greet');
  const markerPath = await writeMarker(root);

  const result = await run(SCRIPT, ['--root', root, '--done'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.access(markerPath));
});

test('--done on an already-removed marker is not an error', async () => {
  const root = await checkoutRepository();

  const result = await run(SCRIPT, ['--root', root, '--done'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
});

test('a --reviewer flag passes through to pick-reviewer unchanged', async () => {
  const root = await checkoutRepository();
  await commitFiles(root, { 'src/app.js': 'export const greet = () => "hi";\n' }, 'feat(app): greet');
  await writeMarker(root);

  const result = await run(SCRIPT, ['--root', root, '--reviewer', 'exo:review-branch-deep'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.split('\n')[0], 'exo:review-branch-deep');
});

test('exits 1 with one line when the repository has no default branch', async () => {
  const root = await checkoutRepository();
  git(root, 'symbolic-ref', '--delete', 'refs/remotes/origin/HEAD');

  const result = await run(SCRIPT, ['--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'finish-run: no default branch: refs/remotes/origin/HEAD is unset');
});

test('exits 1 with one line when the default branch has no merge-base', async () => {
  const root = await checkoutRepository();
  git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/no-such-branch');

  const result = await run(SCRIPT, ['--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim(), 'finish-run: no merge base with origin/no-such-branch');
});
