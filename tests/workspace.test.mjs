// Each output kind of lib/workspace.mjs (stop, init, commit-here, ask) and
// each `--pick` (branch, worktree, current), against temporary git repositories.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import fs_promises from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git, gitRepository, run } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../lib/workspace.mjs', import.meta.url));

function runWorkspace(args, options = {}) {
  return run(SCRIPT, args, options);
}

test('stop: outside git with no --plan-repository', async () => {
  const dir = await fixture();
  const result = await runWorkspace(['--repository', dir]);
  assert.equal(result.code, 0);
  assert.equal(result.stdout.trim(), `stop ${dir} is not a git repository`);
});

test('init: --plan-repository names an empty folder', async () => {
  const dir = await fixture();
  const result = await runWorkspace(['--repository', dir, '--plan-repository']);
  assert.equal(result.stdout.trim(), 'init');
});

test('init: --plan-repository names a folder holding only docs', async () => {
  const dir = await fixture();
  await fs_promises.mkdir(path.join(dir, 'docs'));
  const result = await runWorkspace(['--repository', dir, '--plan-repository']);
  assert.equal(result.stdout.trim(), 'init');
});

test('stop: --plan-repository names a folder holding more than docs', async () => {
  const dir = await fixture();
  await fs_promises.writeFile(path.join(dir, 'notes.txt'), 'hi');
  const result = await runWorkspace(['--repository', dir, '--plan-repository']);
  assert.equal(result.stdout.trim(), `stop ${dir} holds notes.txt; an init would capture files the plan never named`);
});

test('stop: --plan-repository names a folder nested inside another repository', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const nested = path.join(root, 'nested');
  await fs_promises.mkdir(nested);
  const result = await runWorkspace(['--repository', nested, '--plan-repository']);
  assert.equal(result.stdout.trim(), `stop ${nested} sits inside ${root}`);
});

test('commit-here: inside a linked worktree', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const worktreePath = path.join(path.dirname(root), `${path.basename(root)}-wt`);
  git(root, 'worktree', 'add', worktreePath, '-b', 'feature/wt');
  const result = await runWorkspace(['--repository', worktreePath]);
  const realWorktree = await fs_promises.realpath(worktreePath);
  assert.equal(result.stdout.trim(), `commit-here ${realWorktree}`);
});

// Without `refs/remotes/origin/HEAD`, workspace.md's fallback makes the
// current branch its own default, so the non-default-branch tests fake that
// ref onto the repository's own `main`, with no real remote needed.
function fakeOriginHead(root) {
  const mainSha = git(root, 'rev-parse', 'main');
  git(root, 'update-ref', 'refs/remotes/origin/main', mainSha);
  git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
}

test('commit-here: already on a non-default branch', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  fakeOriginHead(root);
  git(root, 'switch', '-c', 'feature/already-here');
  const result = await runWorkspace(['--repository', root]);
  assert.equal(result.stdout.trim(), 'commit-here feature/already-here');
});

async function setWorkspaceSetting(root, value) {
  await fs_promises.mkdir(path.join(root, '.claude'), { recursive: true });
  await fs_promises.writeFile(path.join(root, '.claude', 'exo.json'), `${JSON.stringify({ workspace: value })}\n`);
}

test('commit-here: workspace setting "current" carries out the pick with no question', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  await setWorkspaceSetting(root, 'current');
  const result = await runWorkspace(['--repository', root]);
  assert.equal(result.stdout.trim(), 'commit-here main');
});

test('commit-here: workspace setting "branch" carries out the pick with no question', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  await setWorkspaceSetting(root, 'branch');
  const result = await runWorkspace(['--repository', root, '--name', 'feat/from-setting']);
  assert.equal(result.stdout.trim(), 'commit-here feat/from-setting');
  assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/from-setting');
});

test('commit-here: workspace setting "worktree" carries out the pick with no question', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  await setWorkspaceSetting(root, 'worktree');
  const result = await runWorkspace(['--repository', root, '--name', 'feat/from-setting-wt']);
  const line = result.stdout.trim();
  assert.match(line, /^commit-here /);
  assert.ok(fs.existsSync(line.slice('commit-here '.length)));
});

test('ask: workspace setting "ask" on the default branch prints the menu, branch first', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root]);
  const lines = result.stdout.trimEnd().split('\n');
  assert.equal(lines[0], 'ask');
  assert.match(lines[1], /^1\. \*\*Branch \(Recommended\)\*\*/);
  assert.match(lines[2], /^2\. \*\*Worktree\*\*/);
  assert.match(lines[3], /^3\. \*\*Current branch\*\*/);
});

test('ask: --current-recommended reorders the menu, current branch first', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--current-recommended']);
  const lines = result.stdout.trimEnd().split('\n');
  assert.match(lines[1], /^1\. \*\*Current branch \(Recommended\)\*\*/);
  assert.match(lines[2], /^2\. \*\*Branch\*\*/);
  assert.match(lines[3], /^3\. \*\*Worktree\*\*/);
});

test('--pick branch: switches to a new branch and reports it', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--pick', 'branch', '--name', 'feat/picked']);
  assert.equal(result.stdout.trim(), 'switched to branch feat/picked');
  assert.equal(git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), 'feat/picked');
});

test('--pick worktree: adds a worktree and reports its path', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--pick', 'worktree', '--name', 'feat/picked-wt']);
  const line = result.stdout.trim();
  assert.match(line, /^added worktree at /);
  assert.ok(fs.existsSync(line.slice('added worktree at '.length)));
});

test('--pick current: stays and reports the branch', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--pick', 'current']);
  assert.equal(result.stdout.trim(), 'staying on main');
});

test('--pick with an invalid value exits 1', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--pick', 'bogus']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /invalid pick 'bogus'/);
});

test('--pick is disallowed once the repository already resolves (already on a chosen branch)', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  fakeOriginHead(root);
  git(root, 'switch', '-c', 'feature/already-here');
  const result = await runWorkspace(['--repository', root, '--pick', 'branch', '--name', 'feat/again']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /--pick disallowed/);
});

test('--pick branch without --name exits 1', async () => {
  const root = await gitRepository({ 'README.md': 'root\n' });
  const result = await runWorkspace(['--repository', root, '--pick', 'branch']);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /needs --name/);
});
