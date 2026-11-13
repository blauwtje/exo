import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRepository } from '../verify/repository.mjs';
import { checkWorktreePaths } from '../verify/checks/worktree-paths.mjs';

function detail(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-worktree-paths-'));
  const all = { 'skills/.keep': '', ...files };
  for (const [name, text] of Object.entries(all)) {
    fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
    fs.writeFileSync(path.join(root, name), text);
  }
  const messages = [];
  const report = { assert: (ok, ...texts) => messages.push(ok ? '' : texts.at(-1)) };
  checkWorktreePaths(report, createRepository(root));
  return messages.join('');
}

test('lib/checkout.mjs may hold the add call and the folder', () => {
  const owner = "run(['worktree', 'add', where]);\nconst folder = '.claude/worktrees';\n";
  assert.equal(detail({ 'lib/checkout.mjs': owner }), '');
});

test('a script calling git worktree add fails', () => {
  assert.match(detail({ 'lib/a.mjs': "run(['worktree', 'add', slot]);\n" }), /git worktree add outside/);
});

test('a script with a worktree folder literal fails', () => {
  assert.match(detail({ 'hooks/a.mjs': "const p = '.claude/worktrees/x';\n" }), /folder literal/);
  assert.match(detail({ 'hooks/a.mjs': "const p = '.worktrees/x';\n" }), /folder literal/);
});

test('loaded prose naming the command or folder fails', () => {
  assert.match(detail({ 'agents/a.md': 'Run `git worktree add` here.\n' }), /git worktree add outside/);
  assert.match(detail({ 'skills/build/SKILL.md': 'Use .claude/worktrees/x.\n' }), /folder literal/);
});

test('only the guard-rules deny text may name the worktree folder', () => {
  const deny = "allowed: 'a worktree under `.claude/worktrees/<name>`'\n";
  assert.equal(detail({ 'lib/guard-rules.mjs': deny }), '');
  assert.match(detail({ 'lib/guard-rules.mjs': "const f = '.claude/worktrees';\n" }), /folder literal/);
  assert.match(detail({ 'lib/other.mjs': deny }), /folder literal/);
});
