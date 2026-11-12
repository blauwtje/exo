import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { unfinishedMerge } from '../lib/merge-state.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { removeWorktree, RemoveWorktreeError } from '../skills/build/scripts/remove-worktree.mjs';
import { commitFiles, GIT_IDENTITY, git, gitRepository, run } from './harness.mjs';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { landingCheckout, PLAN } from './land-task-fixture.mjs';

const NEXT_TASK = path.resolve('skills/build/scripts/next-task.mjs');
const SQUASH_CHECK = path.resolve('skills/build/scripts/squash-check.mjs');

async function repositoryWithBranches(files) {
  const root = await gitRepository({ 'src/app.js': 'export const greeting = "hello";\n', 'src/other.js': 'export const other = 1;\n' });
  excludeScratch(root);
  const worktrees = {};
  for (const [name, content] of Object.entries(files)) {
    const worktree = `${root}-${name}`;
    git(root, 'worktree', 'add', '-b', `feat/${name}`, worktree, 'HEAD');
    await commitFiles(worktree, content, `feat: ${name}`);
    worktrees[name] = worktree;
  }
  return { root, worktrees };
}

function squashCheck(root, branch) {
  return spawnSync(process.execPath, [SQUASH_CHECK, '--branch', branch, '--root', root], { encoding: 'utf8' });
}

function squashInto(root, branch) {
  git(root, 'merge', '--squash', branch);
  git(root, 'commit', '-q', '-m', `squash ${branch}`);
}

function conflictingBranches() {
  return repositoryWithBranches({
    a: { 'src/app.js': 'export const greeting = "hi from a";\n' },
    b: { 'src/app.js': 'export const greeting = "hi from b";\n' },
  });
}

test('squash-check names the conflicting file before any squash and touches nothing', async () => {
  const { root } = await conflictingBranches();
  squashInto(root, 'feat/a');

  const result = squashCheck(root, 'feat/b');

  assert.equal(result.status, 1);
  assert.match(result.stdout, /feat\/b conflicts with main in: src\/app\.js; the branch is kept; rebase it onto main first/);
  assert.equal(git(root, 'status', '--porcelain'), '');
  assert.equal(unfinishedMerge(root), null);
});

test('squash-check and remove-worktree pass a clean branch', async () => {
  const { root, worktrees } = await repositoryWithBranches({
    a: { 'src/app.js': 'export const greeting = "hi from a";\n' },
    b: { 'src/other.js': 'export const other = 2;\n' },
  });
  squashInto(root, 'feat/a');

  assert.equal(squashCheck(root, 'feat/b').status, 0);
  assert.equal(squashCheck(root, 'feat/a').status, 0);
  assert.throws(() => removeWorktree({ worktree: worktrees.b, run: root, kept: true }), /not in/);
  assert.equal(fs.existsSync(worktrees.b), true);
  squashInto(root, 'feat/b');
  removeWorktree({ worktree: worktrees.b, run: root, kept: true });
  assert.equal(fs.existsSync(worktrees.b), false);
});

test('remove-worktree refuses a branch that would conflict and keeps the worktree and branch', async () => {
  const { root, worktrees } = await conflictingBranches();
  squashInto(root, 'feat/a');

  assert.throws(() => removeWorktree({ worktree: worktrees.b, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /feat\/b conflicts with main in: src\/app\.js/);
    return true;
  });
  assert.equal(fs.existsSync(worktrees.b), true);
  assert.match(git(root, 'branch', '--list', 'feat/b'), /feat\/b/);
});

test('after a conflicting squash, squash-check and remove-worktree refuse and name the file', async () => {
  const { root, worktrees } = await conflictingBranches();
  squashInto(root, 'feat/a');
  const merge = spawnSync('git', ['-C', root, 'merge', '--squash', 'feat/b'], { encoding: 'utf8', env: { ...process.env, ...GIT_IDENTITY } });
  assert.match(merge.stdout, /CONFLICT/);
  assert.deepEqual(unfinishedMerge(root).files, ['src/app.js']);

  const check = squashCheck(root, 'feat/b');
  assert.equal(check.status, 1);
  assert.match(check.stdout, /unfinished merge \(unmerged paths: src\/app\.js\)/);
  assert.throws(() => removeWorktree({ worktree: worktrees.b, run: root, kept: true }), /unfinished merge \(unmerged paths: src\/app\.js\).*the worktree and branch are kept/);
  assert.equal(fs.existsSync(worktrees.b), true);
  assert.match(git(root, 'branch', '--list', 'feat/b'), /feat\/b/);
});

test('squash-check rejects a missing branch and a missing flag', async () => {
  const { root } = await conflictingBranches();

  assert.equal(squashCheck(root, 'feat/none').status, 1);
  assert.equal(spawnSync(process.execPath, [SQUASH_CHECK], { encoding: 'utf8' }).status, 2);
});

async function unfinishedCheckout() {
  const { root, planPath } = await landingCheckout();
  git(root, 'switch', '-q', '-c', 'side');
  await commitFiles(root, { 'src/app.js': 'export const side = 1;\n' }, 'feat: side');
  git(root, 'switch', '-q', 'main');
  await commitFiles(root, { 'src/app.js': 'export const main = 1;\n' }, 'feat: main');
  spawnSync('git', ['-C', root, 'merge', '--squash', 'side'], { encoding: 'utf8' });
  assert.deepEqual(unfinishedMerge(root).files, ['src/app.js']);
  return { root, planPath };
}

test('next-task reports Start: none and names the unmerged paths while main has an unfinished merge', async () => {
  const { root, planPath } = await unfinishedCheckout();

  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Start: none$/m);
  assert.match(result.stdout, /main has an unfinished merge \(unmerged paths: src\/app\.js\); finish or abort it first/);
});

test('land-task refuses a checkout with an unfinished merge and names the unmerged paths', async () => {
  const { root, planPath } = await unfinishedCheckout();

  assert.throws(() => landTask({ planPath, planText: PLAN, number: 2, root }), /main has an unfinished merge \(unmerged paths: src\/app\.js\)/);
});

test('landing.md runs squash-check before each squash', () => {
  const landing = fs.readFileSync('.claude/landing.md', 'utf8');

  const check = landing.indexOf('squash-check.mjs --branch <branch>');

  assert.ok(check >= 0);
  assert.ok(check < landing.indexOf('`git merge --squash <branch>` and commit'));
});

test('a squashed branch whose neighbour line later changed counts as landed, a branch with a missing change does not', async () => {
  const base = { 'src/app.js': 'one\ntwo\nthree\n' };
  const root = await gitRepository(base);
  excludeScratch(root);
  const worktree = `${root}-fix`;
  git(root, 'worktree', 'add', '-b', 'feat/fix', worktree, 'HEAD');
  await commitFiles(worktree, { 'src/app.js': 'one\nTWO\nthree\n' }, 'feat: fix');
  await commitFiles(worktree, { 'src/extra.js': 'x\n' }, 'feat: extra');
  git(root, 'merge', '--squash', 'feat/fix');
  git(root, 'commit', '-q', '-m', 'squash');
  await commitFiles(root, { 'src/app.js': 'one\nTWO\nTHREE\n' }, 'later');
  await commitFiles(worktree, { 'src/app.js': 'one\nTWO\nthree!\n' }, 'feat: more');

  assert.match(squashCheck(root, 'feat/fix').stdout, /conflicts with main/);
  git(worktree, 'reset', '-q', '--hard', 'HEAD~1');
  assert.match(squashCheck(root, 'feat/fix').stdout, /already landed on main/);
});

test('a branch changing a line the target changed differently is not landed even when the target holds its new text elsewhere', async () => {
  const root = await gitRepository({ 'f.js': 'a\nx = 1\nb\nc\nreturn;\n' });
  excludeScratch(root);
  git(root, 'checkout', '-q', '-b', 'fix');
  await commitFiles(root, { 'f.js': 'a\nreturn;\nb\nc\nreturn;\n' }, 'fix');
  git(root, 'checkout', '-q', 'main');
  await commitFiles(root, { 'f.js': 'a\nx = 2\nb\nc\nreturn;\n' }, 'other');

  assert.doesNotMatch(squashCheck(root, 'fix').stdout, /already landed/);
});

test('remove-worktree refuses a landed branch with a tracked change and removes it once clean', async () => {
  const { root, worktrees } = await repositoryWithBranches({
    a: { 'src/app.js': 'export const greeting = "hi from a";\n' },
  });
  squashInto(root, 'feat/a');
  fs.appendFileSync(path.join(root, 'src', 'app.js'), 'export const later = 1;\n');
  git(root, 'commit', '-q', '-am', 'later');
  fs.writeFileSync(path.join(worktrees.a, 'src', 'app.js'), 'export const greeting = "unsaved";\n');

  assert.throws(() => removeWorktree({ worktree: worktrees.a, run: root, kept: true }), /not in/);
  assert.equal(fs.existsSync(worktrees.a), true);
  git(worktrees.a, 'checkout', '--', 'src/app.js');
  removeWorktree({ worktree: worktrees.a, run: root, kept: true });
  assert.equal(fs.existsSync(worktrees.a), false);
});

test('a squashed fix folded with a later neighbour change by a soft reset counts as landed, a deletion main still lacks does not', async () => {
  const lines = (...rows) => `${rows.join('\n')}\n`;
  const root = await gitRepository({ 'f.js': lines('a', 'b', 'c', 'd', 'e', 'f') });
  excludeScratch(root);
  git(root, 'checkout', '-q', '-b', 'fix');
  await commitFiles(root, { 'f.js': lines('a', 'B', 'c', 'd', 'e', 'f') }, 'fix');
  await commitFiles(root, { 'f.js': lines('a', 'B', 'c', 'd', 'e') }, 'drop f');
  git(root, 'checkout', '-q', 'main');
  await commitFiles(root, { 'f.js': lines('a', 'B', 'C', 'd', 'e', 'f') }, 'main folds fix with a neighbour');

  assert.doesNotMatch(squashCheck(root, 'fix').stdout, /already landed/);
  git(root, 'reset', '-q', '--hard', 'HEAD~1');
  await commitFiles(root, { 'f.js': lines('a', 'B', 'C', 'd', 'e') }, 'main folds fix and deletion');
  git(root, 'checkout', '-q', 'fix');
  git(root, 'reset', '-q', '--soft', 'HEAD~2');
  await commitFiles(root, { 'f.js': lines('a', 'B', 'c', 'd', 'e') }, 'fix squashed');
  git(root, 'checkout', '-q', 'main');

  assert.match(squashCheck(root, 'fix').stdout, /already landed/);
});
