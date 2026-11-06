import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { recordPush, recordRefDiff, recordWorktree, snapshotRefs } from '../skills/build/scripts/run-ops.mjs';
import { appendOp, keepRun, opsFile, readOps, runDir } from '../skills/build/scripts/run-state.mjs';
import { undoRun } from '../skills/build/scripts/run-undo.mjs';
import { git, tempDir } from './harness.mjs';

const ID = 'run-1';

function repo() {
  const root = tempDir('run-undo-');
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 't@t');
  git(root, 'config', 'user.name', 't');
  fs.writeFileSync(path.join(root, '.gitignore'), '.exo/\n');
  fs.writeFileSync(path.join(root, 'a.txt'), 'a\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'base');
  return root;
}

const sha = (root, ref) => git(root, 'rev-parse', ref);
const exists = (root, ref) => spawnSync('git', ['-C', root, 'rev-parse', '-q', '--verify', ref], { encoding: 'utf8' }).status === 0;

function commit(root, name) {
  fs.writeFileSync(path.join(root, name), `${name}\n`);
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', name);
}

function ranRun() {
  const root = repo();
  const dir = runDir(root, ID);
  const base = sha(root, 'main');
  const before = snapshotRefs(root);
  git(root, 'switch', '-q', '-c', 'feat');
  commit(root, 'b.txt');
  git(root, 'switch', '-q', 'main');
  git(root, 'merge', '-q', '--ff-only', 'feat');
  recordRefDiff(root, ID, before, 'test');
  return { root, dir, base, tip: sha(root, 'main') };
}

test('appendOp keeps one JSON line per operation in ops.jsonl', () => {
  const root = tempDir('run-ops-');
  appendOp(root, ID, { kind: 'ref', ref: 'refs/heads/x', before: null, after: 'abc' });
  appendOp(root, ID, { kind: 'push', remote: 'origin', ref: 'x', sha: 'abc' });
  assert.deepEqual(readOps(root, ID).map((op) => op.kind), ['ref', 'push']);
  assert.equal(fs.readFileSync(opsFile(root, ID), 'utf8').trim().split('\n').length, 2);
});

test('recordRefDiff records a created branch and a moved branch', () => {
  const { root, base, tip } = ranRun();
  const refs = readOps(root, ID).filter((op) => op.kind === 'ref');
  assert.deepEqual(refs.map((op) => [op.ref, op.before, op.after]), [
    ['refs/heads/feat', null, tip],
    ['refs/heads/main', base, tip],
  ]);
});

test('undo finds the ops of a run that keepRun moved to .exo/kept', () => {
  const { root, tip } = ranRun();
  keepRun(root, ID);
  assert.equal(fs.existsSync(runDir(root, ID)), false);
  assert.equal(undoRun(root, ID, { apply: false }).pending, 2);
  assert.equal(sha(root, 'main'), tip);
});

test('a dry run prints the plan and changes nothing', () => {
  const { root, dir, tip } = ranRun();
  const result = undoRun(root, ID, { apply: false });
  assert.equal(result.pending, 2);
  assert.equal(result.refused, 0);
  assert.ok(result.lines.every((line) => line.startsWith('would:')));
  assert.equal(sha(root, 'main'), tip);
  assert.ok(exists(root, 'refs/heads/feat'));
  assert.ok(fs.existsSync(dir));
});

test('apply resets refs to the recorded shas and keeps backup refs', () => {
  const { root, base, tip } = ranRun();
  const result = undoRun(root, ID, { apply: true });
  assert.equal(result.refused, 0);
  assert.equal(sha(root, 'main'), base);
  assert.equal(exists(root, 'refs/heads/feat'), false);
  assert.equal(sha(root, `refs/exo/undo/${ID}/heads/main`), tip);
  assert.equal(sha(root, `refs/exo/undo/${ID}/heads/feat`), tip);
  const again = undoRun(root, ID, { apply: true });
  assert.ok(again.lines.every((line) => line.startsWith('already:')));
});

test('apply refuses a ref that moved since the record and leaves it alone', () => {
  const { root, tip } = ranRun();
  commit(root, 'c.txt');
  const moved = sha(root, 'main');
  const result = undoRun(root, ID, { apply: true });
  assert.equal(result.refused, 1);
  assert.match(result.lines.join('\n'), /refused: refs\/heads\/main .*now at/);
  assert.equal(sha(root, 'main'), moved);
  assert.equal(sha(root, 'refs/heads/feat'), tip);
});

test('apply refuses to move a branch checked out with uncommitted work', () => {
  const { root } = ranRun();
  fs.writeFileSync(path.join(root, 'a.txt'), 'dirty\n');
  const tip = sha(root, 'main');
  const result = undoRun(root, ID, { apply: true });
  assert.equal(result.refused, 1);
  assert.equal(sha(root, 'main'), tip);
  assert.equal(fs.readFileSync(path.join(root, 'a.txt'), 'utf8'), 'dirty\n');
});

test('worktrees and pushes are reported and never reversed', () => {
  const { root, dir } = ranRun();
  const tree = path.join(root, 'tree');
  git(root, 'worktree', 'add', '-q', '--detach', tree, 'main');
  recordWorktree(root, ID, 'test', tree, 'feat');
  recordPush(root, ID, 'test', 'origin', 'main', sha(root, 'main'));
  const result = undoRun(root, ID, { apply: true });
  const text = result.lines.join('\n');
  assert.match(text, /manual: pushed .* remote operations are not reversed/);
  assert.match(text, /manual: worktree .* undo leaves it in place/);
  assert.ok(fs.existsSync(tree));
});
