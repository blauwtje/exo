import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { cachedPass, codePass, recordPass, SLOW_GATE_MS, workingTreeKey } from '#check-cache';

function repo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-cache-'));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git('init', '-q');
  git('config', 'user.email', 'a@b.c');
  git('config', 'user.name', 'a');
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  git('add', 'a.txt');
  git('commit', '-q', '-m', 'init');
  return { root, git };
}

test('a recorded pass is found again on the same tree', () => {
  const { root } = repo();
  assert.equal(cachedPass(root, 'npm run check'), null);
  recordPass(root, 'npm run check', 1234);
  assert.deepEqual(cachedPass(root, 'npm run check'), { ms: 1234 });
  assert.equal(cachedPass(root, 'npm test'), null);
});

test('an uncommitted edit to a tracked file misses, and the index stays untouched', () => {
  const { root, git } = repo();
  recordPass(root, 'x', 5);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assert.equal(cachedPass(root, 'x'), null);
  assert.equal(git('diff', '--cached', '--name-only'), '');
});

test('a new untracked file makes a recorded pass miss, and its content is in the key', () => {
  const { root, git } = repo();
  recordPass(root, 'x', 5);
  assert.deepEqual(cachedPass(root, 'x'), { ms: 5 });
  fs.writeFileSync(path.join(root, 'new.txt'), 'x\n');
  assert.equal(cachedPass(root, 'x'), null);
  const first = workingTreeKey(root);
  fs.writeFileSync(path.join(root, 'new.txt'), 'y\n');
  assert.notEqual(workingTreeKey(root), first);
  assert.equal(git('diff', '--cached', '--name-only'), '');
});

test('an ignored file and the scratch folder do not change the key', () => {
  const { root, git } = repo();
  fs.writeFileSync(path.join(root, '.gitignore'), 'skip.txt\n');
  git('add', '.gitignore');
  git('commit', '-q', '-m', 'ignore');
  const before = workingTreeKey(root);
  fs.writeFileSync(path.join(root, 'skip.txt'), 'x\n');
  fs.mkdirSync(path.join(root, '.exo'));
  fs.writeFileSync(path.join(root, '.exo', 'note.txt'), 'x\n');
  assert.equal(workingTreeKey(root), before);
});

test('a pass is recorded only for the tree it ran on', () => {
  const { root } = repo();
  const before = workingTreeKey(root);
  fs.writeFileSync(path.join(root, 'a.txt'), 'edited during the run\n');
  recordPass(root, 'x', 5, before);
  assert.equal(cachedPass(root, 'x'), null);
  recordPass(root, 'x', 5, workingTreeKey(root));
  assert.deepEqual(cachedPass(root, 'x'), { ms: 5 });
});

test('a file named like a pathspec magic is hashed literally', () => {
  const { root } = repo();
  const before = workingTreeKey(root);
  fs.writeFileSync(path.join(root, ':(glob)*.txt'), 'x\n');
  assert.notEqual(workingTreeKey(root), before);
});

test('a second command keeps the first entry', () => {
  const { root } = repo();
  recordPass(root, 'a', 1);
  recordPass(root, 'b', 2);
  assert.deepEqual(cachedPass(root, 'a'), { ms: 1 });
  assert.deepEqual(cachedPass(root, 'b'), { ms: 2 });
});

test('a corrupt cache file reads as empty', () => {
  const { root } = repo();
  recordPass(root, 'a', 1);
  fs.writeFileSync(path.join(root, '.git', 'exo', 'check-cache.json'), 'not json');
  assert.equal(cachedPass(root, 'a'), null);
});

test('a linked worktree shares the cache of the repository', () => {
  const { root, git } = repo();
  const linked = `${root}-linked`;
  git('worktree', 'add', '-q', '--detach', linked);
  recordPass(root, 'x', 7);
  assert.deepEqual(cachedPass(linked, 'x'), { ms: 7 });
  assert.equal(fs.existsSync(path.join(root, '.exo', 'check-cache.json')), false);
  assert.deepEqual(fs.readdirSync(path.join(root, '.git', 'exo')), ['check-cache.json']);
});

test('an old cache in the scratch folder is ignored', () => {
  const { root } = repo();
  fs.mkdirSync(path.join(root, '.exo'));
  fs.writeFileSync(path.join(root, '.exo', 'check-cache.json'), JSON.stringify({ x: { tree: workingTreeKey(root), ms: 9 } }));
  assert.equal(cachedPass(root, 'x'), null);
});

test('codePass finds a pass when only CHANGELOG.md differs, and the entry stores the code key', () => {
  const { root, git } = repo();
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), 'one\n');
  git('add', 'CHANGELOG.md');
  git('commit', '-q', '-m', 'log');
  recordPass(root, 'x', 5);
  const entry = JSON.parse(fs.readFileSync(path.join(root, '.git', 'exo', 'check-cache.json'), 'utf8')).x;
  assert.match(entry.code, /^[0-9a-f]{40,64}$/);
  assert.notEqual(entry.code, entry.tree);
  fs.writeFileSync(path.join(root, 'CHANGELOG.md'), 'two\n');
  assert.equal(cachedPass(root, 'x'), null);
  assert.deepEqual(codePass(root, 'x'), { ms: 5, tree: entry.tree });
  assert.equal(git('diff', '--cached', '--name-only'), '');
});

test('codePass misses on any other edit, on an unknown command and on an entry without code', () => {
  const { root } = repo();
  recordPass(root, 'x', 5);
  assert.equal(codePass(root, 'y'), null);
  fs.writeFileSync(path.join(root, 'a.txt'), 'two\n');
  assert.equal(codePass(root, 'x'), null);
  fs.writeFileSync(path.join(root, 'a.txt'), 'one\n');
  const file = path.join(root, '.git', 'exo', 'check-cache.json');
  const cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete cache.x.code;
  fs.writeFileSync(file, JSON.stringify(cache));
  assert.equal(codePass(root, 'x'), null);
});

test('SLOW_GATE_MS is one minute', () => {
  assert.equal(SLOW_GATE_MS, 60000);
});
