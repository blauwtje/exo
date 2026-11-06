import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'review', 'scripts', 'resolve-target.mjs');
const GIT_ENV = { ...process.env, GIT_AUTHOR_NAME: 'Jane Doe', GIT_AUTHOR_EMAIL: 'user@example.com', GIT_COMMITTER_NAME: 'Jane Doe', GIT_COMMITTER_EMAIL: 'user@example.com' };

function git(root, ...args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: GIT_ENV });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function commit(root, file, text) {
  fs.writeFileSync(path.join(root, file), text);
  git(root, 'add', file);
  git(root, 'commit', '-q', '-m', `change ${file}`);
  return git(root, 'rev-parse', 'HEAD');
}

function resolve(root, args, env = {}) {
  const out = path.join(tempDir('exo-review-out-'), 'out');
  const result = spawnSync('node', [SCRIPT, '--root', root, '--out', out, ...args], { encoding: 'utf8', env: { ...GIT_ENV, ...env } });
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.trim().split('\n');
  return { lines, out, target: lines[0], changed: lines.filter((line) => line.startsWith('CHANGED ')) };
}

function repository() {
  const root = tempDir('exo-review-repo-');
  git(root, 'init', '-q', '-b', 'main');
  const first = commit(root, 'a.js', 'one\ntwo\nthree\n');
  git(root, 'checkout', '-q', '-b', 'topic');
  const second = commit(root, 'a.js', 'one\ntwo\nthree\nfour\n');
  const third = commit(root, 'b.js', 'x\ny\n');
  return { root, first, second, third };
}

test('no target reviews uncommitted tracked and untracked changes against HEAD', () => {
  const { root, third } = repository();
  fs.writeFileSync(path.join(root, 'a.js'), 'one\nTWO\nthree\nfour\n');
  fs.writeFileSync(path.join(root, 'c.js'), 'new\n');
  const result = resolve(root, []);
  assert.equal(result.target, `TARGET kind=uncommitted base=${third} head=worktree`);
  assert.deepEqual(result.changed, ['CHANGED a.js:2-2', 'CHANGED c.js:1-1']);
  assert.match(result.lines.find((line) => line.startsWith('DISPATCH Review:')), new RegExp(`checkout=${root} `));
  assert.match(fs.readFileSync(path.join(result.out, 'review-input.md'), 'utf8'), /\+TWO/);
});

test('a clean tree prints EMPTY and no dispatch', () => {
  const { root } = repository();
  const result = resolve(root, []);
  assert.ok(result.lines.some((line) => line.startsWith('EMPTY')));
  assert.ok(!result.lines.some((line) => line.startsWith('DISPATCH')));
});

test('a single commit maps to its parent and head and exports that tree', () => {
  const { root, second, third } = repository();
  const result = resolve(root, ['--target', third]);
  assert.equal(result.target, `TARGET kind=commit base=${second} head=${third}`);
  assert.deepEqual(result.changed, ['CHANGED b.js:1-2']);
  assert.equal(fs.readFileSync(path.join(result.out, 'checkout', 'b.js'), 'utf8'), 'x\ny\n');
});

test('base..head maps to the merge-base range', () => {
  const { root, first, third } = repository();
  const result = resolve(root, ['--target', `${first}..${third}`]);
  assert.equal(result.target, `TARGET kind=range base=${first} head=${third}`);
  assert.deepEqual(result.changed, ['CHANGED a.js:4-4', 'CHANGED b.js:1-2']);
});

test('a branch name maps to its merge-base with the default branch, not the working tree', () => {
  const { root, first, third } = repository();
  git(root, 'checkout', '-q', 'main');
  fs.writeFileSync(path.join(root, 'a.js'), 'dirty\n');
  const result = resolve(root, ['--target', 'topic']);
  assert.equal(result.target, `TARGET kind=branch base=${first} head=${third}`);
  assert.equal(fs.readFileSync(path.join(result.out, 'checkout', 'a.js'), 'utf8'), 'one\ntwo\nthree\nfour\n');
  assert.equal(git(root, 'status', '--porcelain'), 'M a.js');
});

test('a pull request number fetches its head through gh and git without writing a ref', () => {
  const { root, first, third } = repository();
  const remote = tempDir('exo-review-remote-');
  git(remote, 'init', '-q', '--bare');
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-q', 'origin', 'main', 'topic:refs/pull/7/head');
  git(root, 'fetch', '-q', 'origin', 'main');
  const bin = tempDir('exo-review-bin-');
  const gh = path.join(bin, 'gh');
  fs.writeFileSync(gh, `#!/bin/sh\necho '{"baseRefName":"main","headRefOid":"${third}","title":"Add b"}'\n`, { mode: 0o755 });
  const before = git(root, 'for-each-ref');
  const result = resolve(root, ['--target', '7'], { PATH: `${bin}:${process.env.PATH}` });
  assert.equal(result.target, `TARGET kind=pr base=${first} head=${third}`);
  assert.equal(git(root, 'for-each-ref'), before);
});

test('the skill is registered where the corpus checks expect it', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  assert.ok(fs.existsSync(path.join(root, 'skills', 'review', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(root, 'docs', 'skills', 'review.md')));
  assert.match(fs.readFileSync(path.join(root, 'skills', 'start', 'references', 'cheat-sheet.md'), 'utf8'), /^\| `review` /m);
});
