import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCheck, runCheckAsync } from '../lib/run-check.mjs';

function root() {
  const dir = mkdtempSync(path.join(tmpdir(), 'run-check-async-'));
  execFileSync('git', ['init', '-q', dir]);
  execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', 'commit', '-q', '--allow-empty', '-m', 'init']);
  execFileSync('git', ['-C', dir, 'add', '-A']);
  return dir;
}

test('two async checks overlap instead of running one after another', async () => {
  const one = await runCheckAsync(root(), 'sleep 1', { record: false });
  const started = Date.now();
  const runs = await Promise.all([1, 2, 3].map(() => runCheckAsync(root(), 'sleep 1', { record: false })));
  assert.ok(runs.every((run) => run.ok));
  assert.ok(Date.now() - started < one.ms * 2);
});

test('the async check reports like the sync check', async () => {
  const dir = root();
  const sync = runCheck(dir, 'echo hi; exit 3', { record: false });
  const async = await runCheckAsync(dir, 'echo hi; exit 3', { record: false });
  assert.deepEqual({ ...async, ms: 0 }, { ...sync, ms: 0 });
});

test('the async check times out', async () => {
  const run = await runCheckAsync(root(), 'sleep 5', { timeoutMs: 300, record: false });
  assert.equal(run.ok, false);
  assert.equal(run.timedOut, true);
});

test('an async check killed by a signal is not a pass', async () => {
  const run = await runCheckAsync(root(), 'kill -9 $PPID; wait', { record: false });
  assert.equal(run.ok, false);
  assert.notEqual(run.code, 0);
});
