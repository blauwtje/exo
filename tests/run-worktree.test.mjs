import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { snapshot, breachOf } from '../skills/build/scripts/run-worktree.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
};
const commit = (cwd, file, message) => {
  fs.writeFileSync(path.join(cwd, file), `${message}\n`);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-qm', message);
};
const identify = (cwd) => {
  git(cwd, 'config', 'user.email', 't@t');
  git(cwd, 'config', 'user.name', 't');
};

function fixture({ own = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'run-worktree-'));
  const bare = path.join(dir, 'origin.git');
  const root = path.join(dir, 'work');
  fs.mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  identify(root);
  commit(root, 'a.txt', 'init');
  git(dir, 'init', '-q', '--bare', '-b', 'main', bare);
  git(root, 'remote', 'add', 'origin', bare);
  git(root, 'push', '-q', 'origin', 'main');
  const other = path.join(dir, 'other');
  git(dir, 'clone', '-q', bare, other);
  identify(other);
  git(root, 'switch', '-q', '-c', 'feat');
  if (own) commit(root, 'b.txt', 'feat');
  return { dir, root, other };
}

const foreignPush = (other, branch = 'main', from = 'main') => {
  git(other, 'switch', '-q', from);
  commit(other, `${branch}-${Date.now()}.txt`, `foreign ${branch}`);
  git(other, 'push', '-q', 'origin', `${from}:${branch}`);
};

test('breachOf ignores a foreign push to main fetched into root', () => {
  const { root, other } = fixture();
  const before = snapshot(root);
  foreignPush(other);
  git(root, 'fetch', '-q', 'origin');
  assert.equal(breachOf(root, before), null);
});

test('breachOf flags a push of the run branch', () => {
  const { root } = fixture();
  const before = snapshot(root);
  git(root, 'push', '-q', 'origin', 'feat');
  assert.equal(breachOf(root, before), 'remote ref moved');
});

test('breachOf flags a run commit pushed to another remote branch', () => {
  const { root } = fixture();
  const before = snapshot(root);
  git(root, 'push', '-q', 'origin', 'feat:main');
  assert.equal(breachOf(root, before), 'remote ref moved');
});

test('breachOf ignores a new foreign branch', () => {
  const { root, other } = fixture();
  const before = snapshot(root);
  foreignPush(other, 'topic');
  git(root, 'fetch', '-q', 'origin');
  assert.equal(breachOf(root, before), null);
});

test('breachOf ignores a deleted foreign branch', () => {
  const { root, other } = fixture();
  foreignPush(other, 'topic');
  git(root, 'fetch', '-q', 'origin');
  const before = snapshot(root);
  git(other, 'push', '-q', 'origin', ':topic');
  git(root, 'fetch', '-q', '--prune', 'origin');
  assert.equal(breachOf(root, before), null);
});

test('breachOf passes when nothing moved', () => {
  const { root } = fixture();
  assert.equal(breachOf(root, snapshot(root)), null);
});

test('breachOf ignores a foreign push on top of the commit the run was cut from', () => {
  const { root, other } = fixture({ own: false });
  const before = snapshot(root);
  foreignPush(other);
  git(root, 'fetch', '-q', 'origin');
  assert.equal(breachOf(root, before), null);
});

test('breachOf flags a run commit pushed through a local branch the session made', () => {
  const { root } = fixture();
  const before = snapshot(root);
  git(root, 'branch', 'tmp', 'HEAD');
  git(root, 'push', '-q', 'origin', 'tmp:main');
  assert.equal(breachOf(root, before), 'remote ref moved');
});

test('breachOf ignores a push of the unpushed local main the run was cut from', () => {
  const { root } = fixture({ own: false });
  git(root, 'switch', '-q', 'main');
  commit(root, 'c.txt', 'unpushed');
  git(root, 'switch', '-q', '-c', 'run');
  const before = snapshot(root);
  git(root, 'push', '-q', 'origin', 'main');
  assert.equal(breachOf(root, before), null);
});
