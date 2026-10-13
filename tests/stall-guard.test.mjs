import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const SCRIPT = path.join(import.meta.dirname, '..', 'lib', 'stall-guard.mjs');

function guard(args, env = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    timeout: 20000,
    env: { ...process.env, EXO_STALL_SECONDS: '', ...env },
  });
}

test('a silent command is stopped with exit 124 and the one-line message', () => {
  const started = Date.now();
  const result = guard(['--idle', '1', '--', 'sleep 30']);
  assert.equal(result.status, 124);
  assert.match(result.stderr, /^exo: no output for 1 s, stopped\. Rerun with output streaming, e\.g\. 2>&1 \| tee <log>, and read the first error line\.\n$/);
  assert.ok(Date.now() - started < 10000);
});

test('a command that keeps printing is not stopped and its output and code pass through', () => {
  const result = guard(['--idle', '2', '--', 'for i in 1 2 3; do echo tick$i; sleep 1; done; exit 3']);
  assert.equal(result.status, 3);
  assert.match(result.stdout, /tick1\ntick2\ntick3\n/);
});

test('EXO_STALL_SECONDS sets the limit when no flag is given', () => {
  const result = guard(['--', 'sleep 30'], { EXO_STALL_SECONDS: '1' });
  assert.equal(result.status, 124);
  assert.match(result.stderr, /no output for 1 s/);
});
