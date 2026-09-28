// remove-worktree.mjs copies a worktree's .exo/ files into the run's .exo/
// before it removes the worktree, and refuses to remove it when a copy fails.

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

test('refuses and removes nothing when a copy fails', async () => {
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
