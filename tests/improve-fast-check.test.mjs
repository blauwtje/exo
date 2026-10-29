import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { fastCheck } from '../skills/improve/scripts/fast-check.mjs';

const script = fileURLToPath(new URL('../skills/improve/scripts/fast-check.mjs', import.meta.url));

const PASSING_TEST = "import test from 'node:test';\ntest('reads src', () => { const file = 'src/x.js'; });\n";
const FAILING_TEST = "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('reads src', () => { const file = 'src/x.js'; assert.equal(1, 2); });\n";
const SLOW_TEST = "import test from 'node:test';\ntest('reads src', async () => { const file = 'src/x.js'; await new Promise((resolve) => setTimeout(resolve, 5000)); });\n";

function write(worktree, name, text) {
  fs.mkdirSync(path.dirname(path.join(worktree, name)), { recursive: true });
  fs.writeFileSync(path.join(worktree, name), text);
}

function git(worktree, ...args) {
  const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: worktree, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
}

function setup({ testText, fastCheckCommand = null } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fast-check-'));
  const worktree = path.join(root, 'tree');
  write(worktree, 'src/x.js', 'export const x = 1;\n');
  if (testText) write(worktree, 'tests/x.test.mjs', testText);
  git(worktree, 'init', '-q');
  git(worktree, 'add', '-A');
  git(worktree, 'commit', '-q', '-m', 'base');
  write(root, '.exo/improve/t.json', JSON.stringify({ worktree: 'tree', fastCheck: fastCheckCommand }));
  return { root, worktree };
}

const touch = (worktree) => write(worktree, 'src/x.js', 'export const x = 2;\n');
const cli = (root) => spawnSync('node', [script, '--root', root, '--tag', 't'], { encoding: 'utf8' });

test('passes with no fast check and no covering test', () => {
  const { root, worktree } = setup();
  touch(worktree);
  const run = cli(root);
  assert.equal(run.status, 0);
  assert.equal(run.stdout, 'FAST-CHECK pass\n');
});

test('fails with the command when the fast check fails', () => {
  const { root, worktree } = setup({ fastCheckCommand: 'exit 3' });
  touch(worktree);
  const run = cli(root);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, 'FAST-CHECK fail exit 3\n');
});

test('runs a covering test of a changed file and passes when it passes', () => {
  const { root, worktree } = setup({ testText: PASSING_TEST, fastCheckCommand: 'true' });
  touch(worktree);
  assert.equal(cli(root).stdout, 'FAST-CHECK pass\n');
});

test('fails with the test command when a covering test fails', () => {
  const { root, worktree } = setup({ testText: FAILING_TEST });
  touch(worktree);
  const run = cli(root);
  assert.equal(run.status, 1);
  assert.equal(run.stdout, 'FAST-CHECK fail node --test tests/x.test.mjs\n');
});

test('skips a failing test that covers no touched file', () => {
  const { root, worktree } = setup({ testText: FAILING_TEST });
  write(worktree, 'docs/readme.md', 'new\n');
  assert.equal(cli(root).stdout, 'FAST-CHECK pass\n');
});

test('an untracked file counts as touched', () => {
  const { root, worktree } = setup({ testText: FAILING_TEST.replace('src/x.js', 'src/new.js') });
  write(worktree, 'src/new.js', 'x\n');
  assert.equal(cli(root).status, 1);
});

test('a covering test that outlasts the timeout fails', () => {
  const { worktree } = setup({ testText: SLOW_TEST });
  touch(worktree);
  const outcome = fastCheck({ worktree, fastCheck: null }, 500);
  assert.equal(outcome.ok, false);
  assert.equal(outcome.command, 'node --test tests/x.test.mjs');
});

test('requires --root and --tag', () => {
  const run = spawnSync('node', [script, '--root', '.'], { encoding: 'utf8' });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--tag is required/);
});
