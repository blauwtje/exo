import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { liveBuild, pruneBuildProgress, refreshBuildProgress, removeBuildProgress, writeBuildProgress } from '#build-progress';

function setup() {
  const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bp-'));
  const checkout = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-bp-co-'));
  return { env: { XDG_CACHE_HOME: cache }, checkout, file: (id) => path.join(cache, 'exo', 'build', `${id}.json`) };
}

test('write stores the documented record and liveBuild reads it', () => {
  const { env, checkout, file } = setup();
  writeBuildProgress({ sessionId: 's1', plan: 'p.md', checkout, landed: 1, total: 3 }, { env, now: 1000 });
  assert.deepEqual(JSON.parse(fs.readFileSync(file('s1'), 'utf8')), { sessionId: 's1', plan: 'p.md', checkout, landed: 1, total: 3, updatedAt: 1000 });
  assert.deepEqual(liveBuild('s1', { env, now: 2000 }), { landed: 1, total: 3 });
});

test('liveBuild is null when finished, stale, missing checkout, corrupt or unknown', () => {
  const { env, checkout, file } = setup();
  writeBuildProgress({ sessionId: 'done', plan: 'p', checkout, landed: 3, total: 3 }, { env, now: 1000 });
  writeBuildProgress({ sessionId: 'old', plan: 'p', checkout, landed: 1, total: 3 }, { env, now: 1000 });
  writeBuildProgress({ sessionId: 'gone', plan: 'p', checkout: path.join(checkout, 'nope'), landed: 1, total: 3 }, { env, now: 1000 });
  fs.writeFileSync(file('bad'), '{oops');
  assert.equal(liveBuild('done', { env, now: 1001 }), null);
  assert.equal(liveBuild('old', { env, now: 1000 + 3600000 }), null);
  assert.equal(liveBuild('gone', { env, now: 1001 }), null);
  assert.equal(liveBuild('bad', { env, now: 1001 }), null);
  assert.equal(liveBuild('none', { env, now: 1001 }), null);
});

test('refresh updates only a record with the same plan; remove deletes it', () => {
  const { env, checkout } = setup();
  refreshBuildProgress({ sessionId: 's', plan: 'p', landed: 1, total: 2 }, { env, now: 5 });
  assert.equal(liveBuild('s', { env, now: 6 }), null);
  writeBuildProgress({ sessionId: 's', plan: 'p', checkout, landed: 0, total: 2 }, { env, now: 10 });
  refreshBuildProgress({ sessionId: 's', plan: 'other', landed: 1, total: 2 }, { env, now: 20 });
  assert.deepEqual(liveBuild('s', { env, now: 21 }), { landed: 0, total: 2 });
  refreshBuildProgress({ sessionId: 's', plan: 'p', landed: 1, total: 2 }, { env, now: 30 });
  assert.deepEqual(liveBuild('s', { env, now: 31 }), { landed: 1, total: 2 });
  removeBuildProgress('s', { env });
  assert.equal(liveBuild('s', { env, now: 32 }), null);
});

test('prune deletes records past the stale window only', () => {
  const { env, checkout, file } = setup();
  writeBuildProgress({ sessionId: 'old', plan: 'p', checkout, landed: 0, total: 2 }, { env, now: 0 });
  writeBuildProgress({ sessionId: 'new', plan: 'p', checkout, landed: 0, total: 2 }, { env, now: 3000000 });
  pruneBuildProgress({ env, now: 3700000 });
  assert.equal(fs.existsSync(file('old')), false);
  assert.equal(fs.existsSync(file('new')), true);
});

test('a session id is sanitized into the file name and write failures stay silent', () => {
  const { env, checkout } = setup();
  writeBuildProgress({ sessionId: '../x', plan: 'p', checkout, landed: 0, total: 2 }, { env, now: 1 });
  assert.deepEqual(liveBuild('../x', { env, now: 2 }), { landed: 0, total: 2 });
  fs.rmSync(path.join(env.XDG_CACHE_HOME, 'exo'), { recursive: true });
  fs.writeFileSync(path.join(env.XDG_CACHE_HOME, 'exo'), 'x');
  assert.doesNotThrow(() => writeBuildProgress({ sessionId: 'a', plan: 'p', checkout, landed: 0, total: 2 }, { env }));
});

test('liveBuild takes the stale window from the env it is given', () => {
  const { env, checkout } = setup();
  writeBuildProgress({ sessionId: 's', plan: 'p', checkout, landed: 0, total: 2 }, { env, now: 1000 });
  assert.equal(liveBuild('s', { env: { ...env, EXO_BUILD_STALE_MS: '10' }, now: 1100 }), null);
  assert.deepEqual(liveBuild('s', { env, now: 1100 }), { landed: 0, total: 2 });
});
