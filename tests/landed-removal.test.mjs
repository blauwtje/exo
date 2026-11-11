import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { removeWorktree, RemoveWorktreeError } from '../skills/build/scripts/remove-worktree.mjs';
import { commitFiles, git, gitRepository } from './harness.mjs';

const SQUASH_CHECK = path.resolve('skills/build/scripts/squash-check.mjs');
const BASE_LOG = '## Unreleased\n\n### Added\n\n- first\n';

async function checkout() {
  const root = await gitRepository({ 'CHANGELOG.md': BASE_LOG, 'src/app.js': 'export const app = 1;\n', 'src/other.js': 'export const other = 1;\n' });
  excludeScratch(root);
  return root;
}

async function branchFrom(root, name, files) {
  const worktree = `${root}-${name}`;
  git(root, 'worktree', 'add', '-b', `feat/${name}`, worktree, 'HEAD');
  await commitFiles(worktree, files, `feat: ${name}`);
  return worktree;
}

function squashInto(root, branch) {
  git(root, 'merge', '--squash', branch);
  git(root, 'commit', '-q', '-m', `squash ${branch}`);
}

async function landedThenTouched() {
  const root = await checkout();
  const worktree = await branchFrom(root, 'landed', { 'CHANGELOG.md': `${BASE_LOG}- landed line\n`, 'src/app.js': 'export const app = 2;\n' });
  squashInto(root, 'feat/landed');
  await commitFiles(root, { 'CHANGELOG.md': `${BASE_LOG}- landed line\n- later line\n`, 'src/app.js': 'export const app = 2;\nexport const later = 3;\n' }, 'feat: later');
  return { root, worktree };
}

test('remove-worktree removes a worktree whose branch landed by squash though later commits touch its files', async () => {
  const { root, worktree } = await landedThenTouched();

  const report = removeWorktree({ worktree, run: root, kept: true });

  assert.match(report, /removed /);
  assert.equal(fs.existsSync(worktree), false);
  assert.match(git(root, 'branch', '--list', 'feat/landed'), /feat\/landed/);
});

test('squash-check says a landed branch has nothing left to squash', async () => {
  const { root } = await landedThenTouched();

  const result = spawnSync(process.execPath, [SQUASH_CHECK, '--branch', 'feat/landed', '--root', root], { encoding: 'utf8' });

  assert.equal(result.status, 1);
  assert.match(result.stdout, /feat\/landed already landed on main; the branch is kept; nothing left to squash/);
});

test('remove-worktree still refuses a branch that has not landed and conflicts with later commits', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'open', { 'CHANGELOG.md': `${BASE_LOG}- open line\n` });
  await commitFiles(root, { 'CHANGELOG.md': `${BASE_LOG}- main line\n` }, 'feat: main');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /feat\/open conflicts with main in: CHANGELOG\.md/);
    return true;
  });
  assert.equal(fs.existsSync(worktree), true);
});

test('remove-worktree refuses a branch of which only some files landed', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'half', { 'CHANGELOG.md': `${BASE_LOG}- half line\n`, 'src/other.js': 'export const other = 5;\n' });
  await commitFiles(root, { 'CHANGELOG.md': `${BASE_LOG}- half line\n- more\n`, 'src/other.js': 'export const other = 6;\n' }, 'feat: partial');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), /feat\/half conflicts with main in: .*src\/other\.js/);
  assert.equal(fs.existsSync(worktree), true);
});

test('remove-worktree refuses a branch whose removed line main still holds', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'drop', { 'CHANGELOG.md': '## Unreleased\n\n### Added\n\n' });
  await commitFiles(root, { 'CHANGELOG.md': `${BASE_LOG}- later\n` }, 'feat: later');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), /feat\/drop conflicts with main in: CHANGELOG\.md/);
  assert.equal(fs.existsSync(worktree), true);
});

test('remove-worktree removes a branch landed by patch id though later commits rewrote its lines', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'rewrite', { 'src/app.js': 'export const app = 2;\n' });
  squashInto(root, 'feat/rewrite');
  await commitFiles(root, { 'src/app.js': 'export const app = 3;\n' }, 'feat: rewrite');

  const report = removeWorktree({ worktree, run: root, kept: true });

  assert.match(report, /removed /);
  assert.equal(fs.existsSync(worktree), false);
});

test('remove-worktree removes a branch landed by patch id when its commits were rebased onto main', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'picked', { 'src/app.js': 'export const app = 2;\n' });
  git(root, 'cherry-pick', 'feat/picked');
  await commitFiles(root, { 'src/app.js': 'export const app = 4;\n' }, 'feat: rewrite');

  const report = removeWorktree({ worktree, run: root, kept: true });

  assert.match(report, /removed /);
});

test('remove-worktree refuses an out-of-scope branch with an unlanded commit by patch id', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'unlanded', { 'src/app.js': 'export const app = 2;\n' });
  await commitFiles(root, { 'src/app.js': 'export const app = 3;\n' }, 'feat: other');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), RemoveWorktreeError);
  assert.equal(fs.existsSync(worktree), true);
});

test('landed by patch id', async () => {
  const root = await checkout();
  const worktree = await branchFrom(root, 'pid', { 'src/app.js': 'export const app = 2;\n' });
  squashInto(root, 'feat/pid');
  await commitFiles(root, { 'src/app.js': 'export const app = 9;\n' }, 'feat: later');

  assert.match(removeWorktree({ worktree, run: root, kept: true }), /removed /);
});
