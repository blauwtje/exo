import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  createRun, updateRun, readState, listRuns, acquireLock, releaseLock, newRunId, isAlive, runDir,
} from '../skills/build/scripts/run-state.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'run-state-'));
const lock = (root) => path.join(root, '.exo', 'run', 'lock');
const deadPid = () => {
  const r = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))']);
  return Number(r.stdout.toString());
};

test('createRun writes state.json with the documented fields', () => {
  const root = tmp();
  const s = createRun(root, { id: 'a', plan: 'p.md', flags: ['--x'], detach: true, log: 'l' });
  assert.deepEqual(Object.keys(s).sort(),
    ['detach', 'exitCode', 'flags', 'id', 'log', 'phase', 'pid', 'plan', 'root', 'startedAt', 'updatedAt']);
  assert.equal(s.phase, 'starting');
  assert.equal(s.exitCode, null);
  assert.deepEqual(readState(root, 'a'), s);
  assert.ok(fs.existsSync(path.join(runDir(root, 'a'), 'state.json')));
});

test('updateRun changes phase and exitCode, keeps id, rejects unknown phase', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p.md' });
  const s = updateRun(root, 'a', { phase: 'stopped', exitCode: 1, id: 'zzz' });
  assert.equal(s.id, 'a');
  assert.equal(readState(root, 'a').phase, 'stopped');
  assert.equal(readState(root, 'a').exitCode, 1);
  assert.throws(() => updateRun(root, 'a', { phase: 'bogus' }));
  assert.throws(() => updateRun(root, 'missing', { phase: 'build' }));
  assert.equal(readState(root, 'missing'), null);
});

test('listRuns returns runs oldest first and skips the lock file', () => {
  const root = tmp();
  createRun(root, { id: 'b', plan: 'p' });
  fs.writeFileSync(path.join(runDir(root, 'b'), 'state.json'),
    JSON.stringify({ ...readState(root, 'b'), startedAt: '2030-01-01T00:00:00.000Z' }));
  createRun(root, { id: 'a', plan: 'p' });
  acquireLock(root, 'a');
  assert.deepEqual(listRuns(root).map((r) => r.id), ['a', 'b']);
  assert.deepEqual(listRuns(tmp()), []);
});

test('lock refuses a second live run and names the holder', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p' });
  createRun(root, { id: 'b', plan: 'p' });
  assert.deepEqual(acquireLock(root, 'a'), { ok: true });
  assert.deepEqual(acquireLock(root, 'b'), { ok: false, holder: 'a' });
  assert.equal(fs.readFileSync(lock(root), 'utf8').trim(), 'a');
});

test('stale lock (dead pid) is taken over and reports the old id', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p', pid: deadPid() });
  acquireLock(root, 'a');
  createRun(root, { id: 'b', plan: 'p' });
  assert.deepEqual(acquireLock(root, 'b'), { ok: true, stale: 'a' });
  assert.equal(fs.readFileSync(lock(root), 'utf8').trim(), 'b');
});

test('lock of a final run or a missing state is stale', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p' });
  acquireLock(root, 'a');
  updateRun(root, 'a', { phase: 'passed', exitCode: 0 });
  assert.deepEqual(acquireLock(root, 'b'), { ok: true, stale: 'a' });
  fs.writeFileSync(lock(root), 'ghost\n');
  assert.deepEqual(acquireLock(root, 'c'), { ok: true, stale: 'ghost' });
});

test('releaseLock removes only the owner lock', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p' });
  acquireLock(root, 'a');
  releaseLock(root, 'other');
  assert.ok(fs.existsSync(lock(root)));
  releaseLock(root, 'a');
  assert.ok(!fs.existsSync(lock(root)));
  releaseLock(root, 'a');
});

test('newRunId is unique and isAlive tells live from dead pids', () => {
  assert.notEqual(newRunId(), newRunId());
  assert.equal(isAlive(process.pid), true);
  assert.equal(isAlive(deadPid()), false);
  assert.equal(isAlive(null), false);
});
