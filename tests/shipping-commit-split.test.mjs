import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/ship/scripts/commit-split.mjs', import.meta.url));

async function isolatedEnv() {
  const root = await fs.realpath(await fixture());
  const globalConfig = path.join(root, 'gitconfig');
  await fs.writeFile(globalConfig, '');
  return { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_NOSYSTEM: '1', HOME: root };
}

function git(dir, env, ...args) {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env }).trim();
}

async function write(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(dir, name)), { recursive: true });
    await fs.writeFile(path.join(dir, name), content);
  }
}

async function dirtyRepository() {
  const env = await isolatedEnv();
  const dir = await fs.realpath(await fixture());
  git(dir, env, 'init', '-q', '-b', 'main');
  git(dir, env, 'config', 'user.email', 'user@example.com');
  git(dir, env, 'config', 'user.name', 'Jane Doe');
  git(dir, env, 'config', 'commit.gpgsign', 'false');
  await write(dir, { 'lib/core.mjs': 'export const a = 1;\n', 'old.txt': 'old\n', 'README.md': '# app\n' });
  git(dir, env, 'add', '-A');
  git(dir, env, 'commit', '-q', '-m', 'chore: seed');
  await write(dir, { 'lib/core.mjs': 'export const a = 2;\n', 'lib/new.mjs': 'export const b = 1;\n', 'tests/new.test.mjs': 'ok\n', 'README.md': '# app\n\nUsage.\n' });
  await fs.rm(path.join(dir, 'old.txt'));
  return { dir, env };
}

function planFile(dir, groups) {
  const file = path.join(os.tmpdir(), `split-plan-${path.basename(dir)}.json`);
  return fs.writeFile(file, JSON.stringify({ groups })).then(() => file);
}

function runSplit(dir, env, args) {
  return spawnSync('node', [SCRIPT, '--dir', dir, ...args], { encoding: 'utf8', env });
}

const FULL_PLAN = [
  { subject: 'feat(core): bump a and add b', files: ['lib/core.mjs', 'lib/new.mjs', 'old.txt'] },
  { subject: 'test(core): cover b', files: ['tests/new.test.mjs'] },
  { subject: 'docs: describe usage', body: 'Usage section.', files: ['README.md'] },
];

test('an applied split makes one commit per group and leaves the tree equal to the dirty one', async () => {
  const { dir, env } = await dirtyRepository();
  git(dir, env, 'add', '-A');
  const original = git(dir, env, 'write-tree');
  git(dir, env, 'reset', '-q');
  const plan = await planFile(dir, FULL_PLAN);
  const base = git(dir, env, 'rev-parse', 'HEAD');

  const proposal = runSplit(dir, env, ['--plan', plan]);
  assert.equal(proposal.status, 0, proposal.stderr);
  assert.match(proposal.stdout, /nothing committed/);
  assert.equal(git(dir, env, 'rev-parse', 'HEAD'), base);

  const applied = runSplit(dir, env, ['--plan', plan, '--apply']);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(git(dir, env, 'rev-parse', 'HEAD^{tree}'), original);
  assert.equal(git(dir, env, 'status', '--porcelain'), '');

  const commits = git(dir, env, 'rev-list', '--reverse', `${base}..HEAD`).split('\n');
  assert.equal(commits.length, FULL_PLAN.length);
  commits.forEach((commit, index) => {
    const files = git(dir, env, 'show', '--name-only', '--no-renames', '--format=', commit).split('\n').sort();
    assert.deepEqual(files, [...FULL_PLAN[index].files].sort());
    assert.equal(git(dir, env, 'log', '-1', '--format=%s', commit), FULL_PLAN[index].subject);
  });
});

test('a plan that omits a changed file is refused before any commit', async () => {
  const { dir, env } = await dirtyRepository();
  const base = git(dir, env, 'rev-parse', 'HEAD');
  const plan = await planFile(dir, FULL_PLAN.slice(0, 2));
  const result = runSplit(dir, env, ['--plan', plan, '--apply']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /README\.md is changed but in no group/);
  assert.equal(git(dir, env, 'rev-parse', 'HEAD'), base);
  assert.notEqual(git(dir, env, 'status', '--porcelain'), '');
});

test('a duplicated file, an unknown file and a non-conventional subject are all refused', async () => {
  const { dir, env } = await dirtyRepository();
  const base = git(dir, env, 'rev-parse', 'HEAD');
  const plan = await planFile(dir, [
    { subject: 'update things', files: ['lib/core.mjs', 'lib/new.mjs', 'old.txt', 'README.md'] },
    { subject: 'test: cover b', files: ['tests/new.test.mjs', 'README.md', 'ghost.txt'] },
  ]);
  const result = runSplit(dir, env, ['--plan', plan, '--apply']);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /group 1: a subject follows Conventional Commits/);
  assert.match(result.stderr, /README\.md is in group 1 and group 2/);
  assert.match(result.stderr, /ghost\.txt, which is not a changed file/);
  assert.equal(git(dir, env, 'rev-parse', 'HEAD'), base);
});

test('--list names every changed file with untracked files expanded', async () => {
  const { dir, env } = await dirtyRepository();
  const result = runSplit(dir, env, ['--list']);
  assert.equal(result.status, 0, result.stderr);
  const files = result.stdout.trim().split('\n').map((line) => line.slice(line.indexOf(' ') + 1)).sort();
  assert.deepEqual(files, ['README.md', 'lib/core.mjs', 'lib/new.mjs', 'old.txt', 'tests/new.test.mjs']);
});
