import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { redGreen, runOnBase, testPaths } from '#red-green';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'red-green-test-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 'a');
  fs.writeFileSync(path.join(root, 'value.txt'), 'old\n');
  git('add', '.');
  git('commit', '-q', '-m', 'base');
  return { root, git, base: git('rev-parse', 'HEAD').trim() };
}

const worktrees = (git) => git('worktree', 'list').trim().split('\n').length;
const write = (root, p, text) => {
  fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
  fs.writeFileSync(path.join(root, p), text);
};

test('testPaths keeps test directories and test file names', () => {
  assert.deepEqual(
    testPaths(['lib/a.mjs', 'tests/a.mjs', 'x/__tests__/b.js', 'a.test.js', 'b_test.go', 'test_c.py', 'spec/d.rb', 'src/e.spec.ts', 'testing/f.js']),
    ['tests/a.mjs', 'x/__tests__/b.js', 'a.test.js', 'b_test.go', 'test_c.py', 'spec/d.rb', 'src/e.spec.ts'],
  );
});

test('a test added with its change is proved', () => {
  const { root, git, base } = repo();
  write(root, 'value.txt', 'new\n');
  write(root, 'tests/v.test.sh', 'grep -q new value.txt\n');
  const r = redGreen({ root, base, command: 'sh tests/v.test.sh', overlay: ['tests/v.test.sh'], timeoutMs: 30000 });
  assert.equal(r.outcome, 'proved');
  assert.equal(worktrees(git), 1);
});

test('a test that passes without the change has no red', () => {
  const { root, git, base } = repo();
  write(root, 'tests/v.test.sh', 'test -f value.txt\n');
  const r = redGreen({ root, base, command: 'sh tests/v.test.sh', overlay: ['tests/v.test.sh'], timeoutMs: 30000 });
  assert.equal(r.outcome, 'no-red');
  assert.equal(worktrees(git), 1);
});

test('a failing head is not green', () => {
  const { root, git, base } = repo();
  const r = redGreen({ root, base, command: 'exit 3', timeoutMs: 30000 });
  assert.equal(r.outcome, 'not-green');
  assert.equal(worktrees(git), 1);
});

test('a root-level overlay file is proved', () => {
  const { root, git, base } = repo();
  write(root, 'value.txt', 'new\n');
  write(root, 'a.test.sh', 'grep -q new value.txt\n');
  const r = redGreen({ root, base, command: 'sh a.test.sh', overlay: ['a.test.sh'], timeoutMs: 30000 });
  assert.equal(r.outcome, 'proved');
  assert.equal(worktrees(git), 1);
});

test('a nested symlink overlay path is an error', () => {
  const { root, git, base } = repo();
  fs.mkdirSync(path.join(root, 'tests'));
  fs.symlinkSync('/etc/hosts', path.join(root, 'tests/link.test.txt'));
  const r = runOnBase({ root, base, command: 'true', overlay: ['tests/link.test.txt'], timeoutMs: 30000 });
  assert.equal(r.status, 'error');
  assert.match(r.output, /not a plain file/);
  assert.equal(worktrees(git), 1);
});

test('a worktree that stays registered after cleanup is an error, never proved', () => {
  const { root, git, base } = repo();
  write(root, 'value.txt', 'new\n');
  const command = 'git worktree lock "$(pwd)"; exit 1';
  try {
    const b = runOnBase({ root, base, command, timeoutMs: 30000 });
    assert.equal(b.status, 'error');
    assert.match(b.output, /still registered/);
    const r = redGreen({ root, base, command: `test "$(pwd)" = "${fs.realpathSync(root)}" || { ${command}; }`, timeoutMs: 30000 });
    assert.equal(r.outcome, 'error');
  } finally {
    for (const line of git('worktree', 'list', '--porcelain').split('\n')) {
      if (line.startsWith('worktree ') && line !== `worktree ${fs.realpathSync(root)}`) git('worktree', 'unlock', line.slice(9));
    }
    git('worktree', 'prune');
  }
  assert.equal(worktrees(git), 1);
});

test('a path outside the tree is an error', () => {
  const { root, git, base } = repo();
  const r = redGreen({ root, base, command: 'true', overlay: ['../escape.txt'], timeoutMs: 30000 });
  assert.equal(r.outcome, 'error');
  assert.equal(worktrees(git), 1);
});

test('a symlink overlay path is an error', () => {
  const { root, git, base } = repo();
  fs.symlinkSync('/etc/hosts', path.join(root, 'link.test.txt'));
  const r = runOnBase({ root, base, command: 'true', overlay: ['link.test.txt'], timeoutMs: 30000 });
  assert.equal(r.status, 'error');
  assert.match(r.output, /not a plain file/);
  assert.equal(worktrees(git), 1);
});

test('a directory overlay path is an error', () => {
  const { root, git, base } = repo();
  write(root, 'tests/x.txt', 'x');
  const r = runOnBase({ root, base, command: 'true', overlay: ['tests'], timeoutMs: 30000 });
  assert.equal(r.status, 'error');
  assert.match(r.output, /not a plain file/);
  assert.equal(worktrees(git), 1);
});

test('a deleted head test is removed in the base tree', () => {
  const { root, git } = repo();
  write(root, 'tests/old.test.sh', 'exit 1\n');
  git('add', '.');
  git('commit', '-q', '-m', 'with test');
  const base = git('rev-parse', 'HEAD').trim();
  fs.rmSync(path.join(root, 'tests/old.test.sh'));
  const r = runOnBase({ root, base, command: 'test ! -e tests/old.test.sh', overlay: ['tests/old.test.sh'], timeoutMs: 30000 });
  assert.equal(r.status, 'green');
  assert.equal(worktrees(git), 1);
});

test('a timeout is an error, never red', () => {
  const { root, git, base } = repo();
  const r = runOnBase({ root, base, command: 'sleep 5', timeoutMs: 300 });
  assert.equal(r.status, 'error');
  assert.equal(worktrees(git), 1);
});

test('an unknown base is an error, never proved', () => {
  const { root, git } = repo();
  const r = redGreen({ root, base: 'nope', command: 'true', timeoutMs: 30000 });
  assert.equal(r.outcome, 'error');
  assert.equal(worktrees(git), 1);
});
