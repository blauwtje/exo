import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { HOOK_SPAWN_MS_LOCK } from '../verify/budgets.mjs';
import { checkHookLatency } from '../verify/checks/hook-budgets.mjs';
import { timedSpawn } from '../verify/machine-baseline.mjs';
import { createRepository } from '../verify/repository.mjs';
import { tempDir } from './harness.mjs';

function runCheck(dispatcher, spawn) {
  const root = tempDir('hook-latency-');
  if (dispatcher !== null) {
    fs.mkdirSync(path.join(root, 'hooks'));
    fs.writeFileSync(path.join(root, 'hooks', 'dispatch-bash.mjs'), dispatcher);
  }
  const results = [];
  checkHookLatency({ result: (status, name, detail) => results.push({ status, name, detail }) }, createRepository(root), spawn);
  return results;
}

test('the lock is a positive millisecond count with a date', () => {
  assert.ok(HOOK_SPAWN_MS_LOCK.ms > 0);
  assert.match(HOOK_SPAWN_MS_LOCK.measured, /^\d{4}-\d{2}-\d{2}$/);
});

test('a hook that answers at once passes', () => {
  const results = runCheck('process.stdin.resume();\nprocess.stdin.on("end", () => process.exit(0));\n');
  assert.deepEqual(results.map((result) => result.status), ['PASS']);
  assert.match(results[0].detail, /ms median overhead per Bash hook spawn/);
});

test('a hook that spends longer than the lock fails and names the lock file', () => {
  const stall = `const until = Date.now() + ${HOOK_SPAWN_MS_LOCK.ms * 2};\nwhile (Date.now() < until);\n`;
  const results = runCheck(stall);
  assert.deepEqual(results.map((result) => result.status), ['FAIL']);
  assert.match(results[0].detail, /verify\/budgets\.mjs/);
});

test('a hook that exits non-zero or is missing fails', () => {
  assert.deepEqual(runCheck('process.exit(1);\n').map((result) => result.status), ['FAIL']);
  assert.deepEqual(runCheck(null).map((result) => result.status), ['FAIL']);
});

const QUIET_HOOK = 'process.stdin.resume();\nprocess.stdin.on("end", () => process.exit(0));\n';
const LOAD_MS = 100;

const slowed = (applies) => (args, options) => {
  const elapsed = timedSpawn(args, options);
  return elapsed === null || !applies(args) ? elapsed : elapsed + LOAD_MS;
};

test('a machine that is slower for every spawn, hook and bare node alike, still passes', () => {
  const results = runCheck(QUIET_HOOK, slowed(() => true));
  assert.deepEqual(results.map((result) => result.status), ['PASS']);
});

test('a hook that is slower than a bare node by the same load fails', () => {
  const results = runCheck(QUIET_HOOK, slowed((args) => args[0] !== '-e'));
  assert.deepEqual(results.map((result) => result.status), ['FAIL']);
});
