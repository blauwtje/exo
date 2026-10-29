import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { pruneAfterDays, pruneExo } from '#exo-prune';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);

function workspace() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-prune-'));
  const cwd = path.join(base, 'project');
  const home = path.join(base, 'home');
  fs.mkdirSync(path.join(cwd, '.exo'), { recursive: true });
  fs.mkdirSync(home);
  return { base, cwd, home, exo: path.join(cwd, '.exo') };
}

function age(target, days) {
  const seconds = (NOW - days * DAY_MS) / 1000;
  fs.utimesSync(target, seconds, seconds);
}

function put(file, days, content = 'x') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  age(file, days);
  return file;
}

function exists(target) {
  return fs.lstatSync(target, { throwIfNoEntry: false }) !== undefined;
}

function writeConfig(home, defaults) {
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), typeof defaults === 'string' ? defaults : JSON.stringify({ defaults }));
}

test('an entry whose files are all older than 7 days is removed and a fresh one stays', () => {
  const { cwd, exo } = workspace();
  const stale = put(path.join(exo, 'old.log'), 8);
  const fresh = put(path.join(exo, 'new.log'), 6);
  const staleFolder = put(path.join(exo, 'topic', 'brief.md'), 9);
  const removed = pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(stale), false);
  assert.equal(exists(staleFolder), false);
  assert.equal(exists(path.join(exo, 'topic')), false);
  assert.equal(exists(fresh), true);
  assert.deepEqual(removed.sort(), [stale, path.join(exo, 'topic')].sort());
});

test('a folder with one fresh file among old ones is kept whole', () => {
  const { cwd, exo } = workspace();
  const oldFile = put(path.join(exo, 'topic', 'deep', 'old.md'), 30);
  put(path.join(exo, 'topic', 'new.md'), 1);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(oldFile), true);
});

test('the active run folder is never pruned', () => {
  const { cwd, exo } = workspace();
  const file = put(path.join(exo, 'run', 'state.json'), 90);
  age(path.join(exo, 'run'), 90);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(file), true);
});

test('a symlink is left in place and its target is not touched', () => {
  const { base, cwd, exo } = workspace();
  const outside = put(path.join(base, 'outside', 'keep.txt'), 90);
  const link = path.join(exo, 'link');
  fs.symlinkSync(path.join(base, 'outside'), link);
  const removed = pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  assert.equal(exists(outside), true);
  assert.deepEqual(removed, []);
});

test('a symlink inside a stale folder is unlinked without following it', () => {
  const { base, cwd, exo } = workspace();
  const outside = put(path.join(base, 'outside', 'keep.txt'), 0);
  put(path.join(exo, 'topic', 'a.md'), 40);
  fs.symlinkSync(path.join(base, 'outside'), path.join(exo, 'topic', 'link'));
  fs.lutimesSync(path.join(exo, 'topic', 'link'), (NOW - 40 * DAY_MS) / 1000, (NOW - 40 * DAY_MS) / 1000);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(path.join(exo, 'topic')), false);
  assert.equal(exists(outside), true);
});

test('a .exo that is a symlink to another folder prunes nothing', () => {
  const { base, cwd, exo } = workspace();
  fs.rmSync(exo, { recursive: true });
  const outside = put(path.join(base, 'elsewhere', 'old.log'), 90);
  fs.symlinkSync(path.join(base, 'elsewhere'), exo);
  const removed = pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(outside), true);
  assert.deepEqual(removed, []);
});

test('a missing .exo returns nothing and does not throw', () => {
  const { base } = workspace();
  assert.deepEqual(pruneExo({ cwd: path.join(base, 'absent'), now: NOW, home: '/nonexistent' }), []);
});

test('only the folder with the newest progress.md is protected', () => {
  const { cwd, exo } = workspace();
  const newest = put(path.join(exo, 'alpha', 'progress.md'), 20);
  const older = put(path.join(exo, 'beta', 'progress.md'), 30);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(newest), true);
  assert.equal(exists(older), false);
});

test('container children are judged one by one and the container stays', () => {
  const { cwd, exo } = workspace();
  const stale = put(path.join(exo, 'kept', 'run-a', 'report.md'), 20);
  const fresh = put(path.join(exo, 'kept', 'run-b', 'report.md'), 2);
  const staleLog = put(path.join(exo, 'logs', 'build.log'), 12);
  const freshLog = put(path.join(exo, 'logs', 'task.log'), 1);
  const stalePlan = put(path.join(exo, 'run-plan', 'old', 'plan.md'), 15);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(stale), false);
  assert.equal(exists(fresh), true);
  assert.equal(exists(staleLog), false);
  assert.equal(exists(freshLog), true);
  assert.equal(exists(stalePlan), false);
  assert.equal(exists(path.join(exo, 'kept')), true);
  assert.equal(exists(path.join(exo, 'run-plan')), true);
});

test('a container that is a symlink is not expanded', () => {
  const { base, cwd, exo } = workspace();
  const outside = put(path.join(base, 'outside', 'old.log'), 90);
  fs.symlinkSync(path.join(base, 'outside'), path.join(exo, 'logs'));
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(outside), true);
});

test('the stamp file is written and gates a second walk within 24 hours', () => {
  const { cwd, exo } = workspace();
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  const stamp = path.join(exo, 'pruned-at');
  assert.equal(fs.statSync(stamp).mtimeMs, NOW);
  const stale = put(path.join(exo, 'late.log'), 30);
  assert.deepEqual(pruneExo({ cwd, now: NOW + DAY_MS - 1000, home: '/nonexistent' }), []);
  assert.equal(exists(stale), true);
  assert.deepEqual(pruneExo({ cwd, now: NOW + DAY_MS + 1000, home: '/nonexistent' }), [stale]);
});

test('the stamp file is never pruned', () => {
  const { cwd, exo } = workspace();
  const stamp = put(path.join(exo, 'pruned-at'), 30);
  pruneExo({ cwd, now: NOW, home: '/nonexistent' });
  assert.equal(exists(stamp), true);
});

test('a symlinked stamp blocks the walk and writes nothing through it', () => {
  const { base, cwd, exo } = workspace();
  const target = put(path.join(base, 'target.txt'), 0, 'keep');
  const stale = put(path.join(exo, 'old.log'), 30);
  fs.symlinkSync(target, path.join(exo, 'pruned-at'));
  assert.deepEqual(pruneExo({ cwd, now: NOW, home: '/nonexistent' }), []);
  assert.equal(fs.readFileSync(target, 'utf8'), 'keep');
  assert.equal(exists(stale), true);
});

test('pruneAfterDays reads the catalog default of 7', () => {
  const { home } = workspace();
  assert.equal(pruneAfterDays(home), 7);
});

test('a user run.json overrides the number of days', () => {
  const { cwd, exo, home } = workspace();
  writeConfig(home, { pruneAfterDays: 30 });
  const midway = put(path.join(exo, 'midway.log'), 20);
  const ancient = put(path.join(exo, 'ancient.log'), 31);
  assert.equal(pruneAfterDays(home), 30);
  pruneExo({ cwd, now: NOW, home });
  assert.equal(exists(midway), true);
  assert.equal(exists(ancient), false);
});

test('an invalid or unreadable setting falls back to 7 and never removes everything', () => {
  for (const bad of [0, -3, 1.5, '3', null, [], {}]) {
    const { home } = workspace();
    writeConfig(home, { pruneAfterDays: bad });
    assert.equal(pruneAfterDays(home), 7, JSON.stringify(bad));
  }
  const broken = workspace();
  writeConfig(broken.home, '{ not json');
  assert.equal(pruneAfterDays(broken.home), 7);
});

test('a removal that fails leaves the files in place and does not throw', () => {
  const { cwd, exo } = workspace();
  const stale = put(path.join(exo, 'locked', 'old.md'), 30);
  fs.chmodSync(path.join(exo, 'locked'), 0o500);
  try {
    assert.doesNotThrow(() => pruneExo({ cwd, now: NOW, home: '/nonexistent' }));
  } finally {
    fs.chmodSync(path.join(exo, 'locked'), 0o700);
  }
  if (process.getuid?.() !== 0) assert.equal(exists(stale), true);
});

test('a folder holding no regular file is aged by its own mtime, not by empty subfolders or symlinks', () => {
  const { cwd, exo } = workspace();
  const emptyChild = path.join(exo, 'a', 'b');
  fs.mkdirSync(emptyChild, { recursive: true });
  age(emptyChild, 10);
  age(path.join(exo, 'a'), 1);
  const linked = path.join(exo, 'c');
  fs.mkdirSync(linked);
  const link = path.join(linked, 'link');
  fs.symlinkSync(exo, link);
  fs.lutimesSync(link, (NOW - 10 * DAY_MS) / 1000, (NOW - 10 * DAY_MS) / 1000);
  age(linked, 1);
  assert.deepEqual(pruneExo({ cwd, now: NOW, home: '/nonexistent' }), []);
  assert.equal(exists(emptyChild), true);
  assert.equal(exists(link), true);
});
