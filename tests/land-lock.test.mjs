import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import * as landLock from '../lib/land-lock.mjs';
import { git, gitRepository } from './harness.mjs';

const children = [];

after(() => {
  for (const child of children) child.kill();
});

function sleeper() {
  const child = spawn('sleep', ['600'], { stdio: 'ignore' });
  children.push(child);
  return child;
}

async function repository() {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const lock = path.join(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir'), 'exo-land.lock');
  return { root, lock };
}

function deadPid() {
  const child = spawn('true', { stdio: 'ignore' });
  return new Promise((resolve) => child.on('exit', () => resolve(child.pid)));
}

test('a lock naming a live unrelated pid with no start time is taken over at once', async () => {
  const { root, lock } = await repository();
  fs.writeFileSync(lock, `${sleeper().pid}\n`);
  let ran = false;
  landLock.withLandLock(root, () => { ran = true; }, { timeoutMs: 2000 });
  assert.equal(ran, true);
  assert.equal(fs.existsSync(lock), false);
});

test('a lock naming a live pid with a different start time is taken over at once', async () => {
  const { root, lock } = await repository();
  fs.writeFileSync(lock, `${sleeper().pid}\nThu Jan  1 00:00:00 1970\n`);
  let ran = false;
  landLock.withLandLock(root, () => { ran = true; }, { timeoutMs: 2000 });
  assert.equal(ran, true);
});

test('an unparseable lock file is taken over at once', async () => {
  const { root, lock } = await repository();
  fs.writeFileSync(lock, 'not a pid\n');
  let ran = false;
  landLock.withLandLock(root, () => { ran = true; }, { timeoutMs: 2000 });
  assert.equal(ran, true);
});

test('a lock naming a dead pid is removed and the action runs', async () => {
  const { root, lock } = await repository();
  fs.writeFileSync(lock, `${await deadPid()}\nThu Jan  1 00:00:00 1970\n`);
  let ran = false;
  landLock.withLandLock(root, () => { ran = true; }, { timeoutMs: 2000 });
  assert.equal(ran, true);
  assert.equal(fs.existsSync(lock), false);
});

test('a lock held by a proven live owner times out naming the pid, start time and path', async () => {
  const { root, lock } = await repository();
  const owner = sleeper();
  const start = landLock.processStart(owner.pid);
  assert.ok(start);
  fs.writeFileSync(lock, `${owner.pid}\n${start}\n`);
  assert.throws(
    () => landLock.withLandLock(root, () => assert.fail('must not run'), { timeoutMs: 300 }),
    (error) => error instanceof landLock.LandLockError && error.message.includes(`pid ${owner.pid}`) && error.message.includes(start) && error.message.includes(lock),
  );
  assert.equal(fs.existsSync(lock), true);
});

test('a lock written by withLandLock names the running process and is removed afterwards', async () => {
  const { root, lock } = await repository();
  landLock.withLandLock(root, () => {
    assert.equal(fs.readFileSync(lock, 'utf8'), `${process.pid}\n${landLock.processStart(process.pid)}\n`);
  });
  assert.equal(fs.existsSync(lock), false);
});

test('processStart works inside a sandbox that blocks ps', { skip: process.platform !== 'darwin', timeout: 60_000 }, async () => {
  const { sandboxProfile } = await import('../lib/confine-claude.mjs');
  const module = new URL('../lib/land-lock.mjs', import.meta.url).href;
  const script = `import(${JSON.stringify(module)}).then((m) => { const a = m.processStart(process.pid); console.log(a === m.processStart(process.pid) && a !== null ? 'OK' : 'BAD'); });`;
  const result = spawnSync('sandbox-exec', ['-p', sandboxProfile([os.tmpdir(), process.cwd()]), process.execPath, '-e', script], { encoding: 'utf8' });
  assert.equal(result.stdout.trim(), 'OK', result.stderr);
});
