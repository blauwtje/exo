// remove-worktree.mjs copies a worktree's .exo/ files into the run's .exo/
// (or, with --kept, into .exo/kept/<name>/, first moving an existing folder of
// that name to <name>-<stamp>/) before it removes the worktree, and refuses to
// remove it, with any moved kept folder back in place, when a copy fails or
// git refuses.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { removeWorktree, RemoveWorktreeError } from '../skills/build/scripts/remove-worktree.mjs';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { git, gitRepository } from './harness.mjs';

// `.exo/` is excluded (lib/scratch-exclude.mjs), not gitignored, the same as a
// real wave worktree, so `git worktree remove` sees it as clean rather than
// refusing over an "untracked" .exo/ file.
async function runWithWorktree() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  excludeScratch(root);
  const worktree = `${root}-task-1`;
  git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  return { root, worktree };
}

test('copies the worktree .exo/ files into the run and removes the worktree', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo', 'sub'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'top level\n');
  fs.writeFileSync(path.join(worktree, '.exo', 'sub', 'note.md'), 'nested\n');

  const output = removeWorktree({ worktree, run: root });

  assert.match(output, /Copied 2 \.exo\/ file\(s\)/);
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'report.md'), 'utf8'), 'top level\n');
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'sub', 'note.md'), 'utf8'), 'nested\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('refuses and removes nothing when a copy fails', { skip: process.getuid?.() === 0 }, async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'blocked\n');
  fs.mkdirSync(path.join(root, '.exo'), { recursive: true, mode: 0o555 });

  try {
    assert.throws(() => removeWorktree({ worktree, run: root }), RemoveWorktreeError);
    assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));
    assert.equal(fs.existsSync(path.join(root, '.exo', 'report.md')), false);
  } finally {
    fs.chmodSync(path.join(root, '.exo'), 0o755);
  }
});

test('--kept copies into .exo/kept/<name>/ and leaves the run .exo/ untouched', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'branch-review.md'), 'from the worktree\n');
  fs.mkdirSync(path.join(root, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(root, '.exo', 'branch-review.md'), 'the run own\n');

  const output = removeWorktree({ worktree: `${worktree}/`, run: root, kept: true });

  const kept = path.join(root, '.exo', 'kept', path.basename(worktree));
  assert.match(output, new RegExp(`to '${kept}/'`));
  assert.equal(fs.readFileSync(path.join(kept, 'branch-review.md'), 'utf8'), 'from the worktree\n');
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'branch-review.md'), 'utf8'), 'the run own\n');
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

// Two worktrees named `task` under different parents, each holding one
// `.exo/task-1.patch` that names its own worktree.
async function runWithTwoSameNamedWorktrees() {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  excludeScratch(root);
  const first = path.join(`${root}-a`, 'task');
  const second = path.join(`${root}-b`, 'task');
  for (const worktree of [first, second]) {
    git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
    fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
    fs.writeFileSync(path.join(worktree, '.exo', 'task-1.patch'), `from ${worktree}\n`);
  }
  return { root, first, second };
}

test('--kept moves an existing same-named folder to a stamped one and removes the second worktree', async () => {
  const { root, first, second } = await runWithTwoSameNamedWorktrees();
  removeWorktree({ worktree: first, run: root, kept: true });

  const output = removeWorktree({ worktree: second, run: root, kept: true });

  const keptRoot = path.join(root, '.exo', 'kept');
  const stamped = fs.readdirSync(keptRoot).filter((name) => /^task-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(name));
  assert.equal(stamped.length, 1);
  assert.match(output, new RegExp(`moved existing '.*/kept/task/' to '.*/kept/${stamped[0]}/'`));
  assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'task-1.patch'), 'utf8'), `from ${second}\n`);
  assert.equal(fs.readFileSync(path.join(keptRoot, stamped[0], 'task-1.patch'), 'utf8'), `from ${first}\n`);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(second));
});

test('--kept git refusal after a move restores the existing folder and leaves no stamped one', async () => {
  const { root, first, second } = await runWithTwoSameNamedWorktrees();
  removeWorktree({ worktree: first, run: root, kept: true });
  fs.writeFileSync(path.join(second, 'src', 'app.js'), 'dirty\n');

  assert.throws(() => removeWorktree({ worktree: second, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /git refused to remove .*contains modified or untracked files/);
    return true;
  });
  const keptRoot = path.join(root, '.exo', 'kept');
  assert.deepEqual(fs.readdirSync(keptRoot), ['task']);
  assert.equal(fs.readFileSync(path.join(keptRoot, 'task', 'task-1.patch'), 'utf8'), `from ${first}\n`);
  assert.match(git(root, 'worktree', 'list'), new RegExp(second));
});

test('--kept with no .exo/ files creates no folder and still removes the worktree', async () => {
  const { root, worktree } = await runWithWorktree();

  removeWorktree({ worktree, run: root, kept: true });

  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept')), false);
  assert.doesNotMatch(git(root, 'worktree', 'list'), new RegExp(worktree));
});

test('--kept turns git refusal into a RemoveWorktreeError, drops its copy and allows a retry', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'report.md'), 'kept me\n');
  fs.writeFileSync(path.join(worktree, 'src', 'app.js'), 'dirty\n');

  assert.throws(() => removeWorktree({ worktree, run: root, kept: true }), (error) => {
    assert.ok(error instanceof RemoveWorktreeError);
    assert.match(error.message, /git refused to remove .*contains modified or untracked files/);
    return true;
  });
  assert.equal(fs.existsSync(path.join(root, '.exo', 'kept', path.basename(worktree))), false);
  assert.match(git(root, 'worktree', 'list'), new RegExp(worktree));

  git(worktree, 'checkout', '--', 'src/app.js');
  removeWorktree({ worktree, run: root, kept: true });
  assert.equal(fs.readFileSync(path.join(root, '.exo', 'kept', path.basename(worktree), 'report.md'), 'utf8'), 'kept me\n');
});

test('copies a .exo/ file whose name has a space', async () => {
  const { root, worktree } = await runWithWorktree();
  fs.mkdirSync(path.join(worktree, '.exo'), { recursive: true });
  fs.writeFileSync(path.join(worktree, '.exo', 'my report.md'), 'spaced\n');

  removeWorktree({ worktree, run: root });

  assert.equal(fs.readFileSync(path.join(root, '.exo', 'my report.md'), 'utf8'), 'spaced\n');
});
