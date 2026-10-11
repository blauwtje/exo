import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import {
  createRun, updateRun, readState, listRuns, acquireLock, releaseLock, newRunId, isAlive, runDir,
  PHASES, FINAL_PHASES, openGate, readGates, approveGates, takeApproved,
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
    ['detach', 'exitCode', 'flags', 'id', 'log', 'phase', 'pid', 'plan', 'root', 'stage', 'startedAt', 'updatedAt']);
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

const MODULE = pathToFileURL(path.resolve('skills/build/scripts/run-state.mjs')).href;
const CONTENDER = `
import fs from 'node:fs';
import path from 'node:path';
const { createRun, acquireLock, releaseLock } = await import(process.argv[1]);
const [, , mode, root, id, rounds] = process.argv;
const wait = (name) => {
  for (let i = 0; !fs.existsSync(path.join(root, name)); i++) {
    if (i > 10000) process.exit(3);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
  }
};
const lock = path.join(root, '.exo', 'run', 'lock');
createRun(root, { id, plan: 'p' });
fs.writeFileSync(path.join(root, 'ready-' + id), '');
wait('go');
if (mode === 'once') {
  fs.writeFileSync(path.join(root, 'result-' + id), JSON.stringify(acquireLock(root, id)));
  wait('end');
} else {
  let won = 0;
  let broken = 0;
  for (let i = 0; i < Number(rounds); i++) {
    if (!acquireLock(root, id).ok) continue;
    won++;
    for (let k = 0; k < 20; k++) {
      try { if (fs.readFileSync(lock, 'utf8').trim() !== id) broken++; } catch { broken++; }
    }
    releaseLock(root, id);
  }
  fs.writeFileSync(path.join(root, 'result-' + id), JSON.stringify({ won, broken }));
}
`;

async function race(root, ids, mode, rounds = 0) {
  const kids = ids.map((id) => new Promise((resolve) => {
    spawn(process.execPath, ['--input-type=module', '-e', CONTENDER, MODULE, mode, root, id, String(rounds)], { stdio: 'ignore' })
      .on('exit', resolve);
  }));
  const until = async (names) => {
    for (let i = 0; !names.every((n) => fs.existsSync(path.join(root, n))); i++) {
      if (i > 2000) throw new Error(`timed out waiting for ${names.join(', ')}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  };
  await until(ids.map((id) => `ready-${id}`));
  fs.writeFileSync(path.join(root, 'go'), '');
  await until(ids.map((id) => `result-${id}`));
  const results = Object.fromEntries(ids.map((id) => [id, JSON.parse(fs.readFileSync(path.join(root, `result-${id}`), 'utf8'))]));
  const lockText = fs.existsSync(lock(root)) ? fs.readFileSync(lock(root), 'utf8').trim() : null;
  const leftovers = fs.readdirSync(path.join(root, '.exo', 'run')).filter((n) => n.startsWith('lock.'));
  fs.writeFileSync(path.join(root, 'end'), '');
  assert.deepEqual(await Promise.all(kids), ids.map(() => 0));
  return { results, lockText, leftovers };
}

test('a fresh lock is never seen empty or taken over by a live contender', async () => {
  const root = tmp();
  const { results, lockText, leftovers } = await race(root, ['a', 'b'], 'loop', 1500);
  assert.equal(results.a.broken, 0);
  assert.equal(results.b.broken, 0);
  assert.equal(lockText, null);
  assert.deepEqual(leftovers, []);
});

test('concurrent contenders on a stale lock: exactly one wins', async () => {
  for (let round = 0; round < 3; round++) {
    const root = tmp();
    createRun(root, { id: 'dead', plan: 'p', pid: deadPid() });
    assert.deepEqual(acquireLock(root, 'dead'), { ok: true });
    const ids = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
    const { results, lockText, leftovers } = await race(root, ids, 'once');
    const winners = ids.filter((id) => results[id].ok);
    assert.equal(winners.length, 1, JSON.stringify(results));
    assert.deepEqual(results[winners[0]], { ok: true, stale: 'dead' });
    for (const id of ids) if (id !== winners[0]) assert.deepEqual(results[id], { ok: false, holder: winners[0] });
    assert.equal(lockText, winners[0]);
    assert.deepEqual(leftovers, []);
  }
});

test('resume replaces a lock naming its own run; a refused acquire leaves no claim files', () => {
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p' });
  assert.deepEqual(acquireLock(root, 'a'), { ok: true });
  assert.deepEqual(acquireLock(root, 'a'), { ok: true, stale: 'a' });
  createRun(root, { id: 'b', plan: 'p' });
  assert.deepEqual(acquireLock(root, 'b'), { ok: false, holder: 'a' });
  assert.deepEqual(fs.readdirSync(path.join(root, '.exo', 'run')).sort(), ['a', 'b', 'lock']);
});

test('phases landing, landed and parked exist; landed and parked are final; stage starts at build', () => {
  for (const p of ['landing', 'landed', 'parked']) assert.ok(PHASES.includes(p));
  assert.ok(FINAL_PHASES.includes('landed') && FINAL_PHASES.includes('parked'));
  assert.ok(!FINAL_PHASES.includes('landing'));
  const root = tmp();
  createRun(root, { id: 'a', plan: 'p' });
  assert.equal(readState(root, 'a').stage, 'build');
  assert.equal(updateRun(root, 'a', { phase: 'parked', stage: 'landing' }).stage, 'landing');
});

test('gates: a multi-line action is kept as one line and taken by either form', () => {
  const dir = tmp();
  openGate(dir, { source: 'task 1', action: 'git push -f x\nrm -rf y', reason: 'denied' });
  assert.deepEqual(readGates(dir).map((g) => g.action), ['git push -f x rm -rf y']);
  approveGates(dir);
  assert.equal(takeApproved(dir, 'git push -f x\nrm -rf y'), true);
});

test('gates: open once, approve, take once by exact trimmed action', () => {
  const dir = tmp();
  assert.deepEqual(readGates(dir), []);
  openGate(dir, { source: 'land', action: 'git push --force-with-lease origin b', reason: 'rejected' });
  openGate(dir, { source: 'land', action: ' git push --force-with-lease origin b ', reason: 'again' });
  openGate(dir, { source: 'task 2', action: 'npm publish', reason: 'irreversible' });
  assert.equal(fs.readFileSync(path.join(dir, 'gates.md'), 'utf8').split('\n')[0],
    '- open: land: git push --force-with-lease origin b (rejected)');
  assert.equal(readGates(dir).length, 2);
  assert.equal(takeApproved(dir, 'npm publish'), false);
  assert.equal(approveGates(dir), 2);
  assert.equal(approveGates(dir), 0);
  assert.equal(takeApproved(dir, 'npm publish --tag x'), false);
  assert.equal(takeApproved(dir, ' npm publish '), true);
  assert.equal(takeApproved(dir, 'npm publish'), false);
  assert.deepEqual(readGates(dir).map((g) => g.status), ['approved', 'used']);
  openGate(dir, { source: 'task 2', action: 'npm publish', reason: 'again' });
  assert.equal(readGates(dir).at(-1).status, 'open');
});
