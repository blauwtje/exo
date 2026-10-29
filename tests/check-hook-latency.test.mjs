import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { HOOK_SPAWN_MS_LOCK } from '../verify/budgets.mjs';
import { checkHookLatency } from '../verify/checks/hook-latency.mjs';
import { createRepository } from '../verify/repository.mjs';

function runCheck(dispatcher) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-latency-'));
  try {
    if (dispatcher !== null) {
      fs.mkdirSync(path.join(root, 'hooks'));
      fs.writeFileSync(path.join(root, 'hooks', 'dispatch-bash.mjs'), dispatcher);
    }
    const results = [];
    checkHookLatency({ result: (status, name, detail) => results.push({ status, name, detail }) }, createRepository(root));
    return results;
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('the lock is a positive millisecond count with a date', () => {
  assert.ok(HOOK_SPAWN_MS_LOCK.ms > 0);
  assert.match(HOOK_SPAWN_MS_LOCK.measured, /^\d{4}-\d{2}-\d{2}$/);
});

test('a hook that answers at once passes', () => {
  const results = runCheck('process.stdin.resume();\nprocess.stdin.on("end", () => process.exit(0));\n');
  assert.deepEqual(results.map((result) => result.status), ['PASS']);
  assert.match(results[0].detail, /ms median per Bash hook spawn/);
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
