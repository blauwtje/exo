// Every safe task's check fails against its seed (the stub) and passes
// against its reference solution, so a pass in a benchmark cell means the
// agent's code held under the adversarial input, not that the check is loose.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';

const SAFE = fileURLToPath(new URL('../benchmarks/safe/', import.meta.url));

function runCheck(taskId, workdir) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(SAFE, taskId, 'check.mjs'), workdir], { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
  });
}

async function workdirWith(taskId, variant) {
  const workdir = await fixture();
  await fs.cp(path.join(SAFE, taskId, variant), workdir, { recursive: true });
  return workdir;
}

for (const task of SAFE_TASKS) {
  test(`${task.id}: the seed fails and the solution passes`, async () => {
    const seeded = await runCheck(task.id, await workdirWith(task.id, 'seed'));
    assert.equal(seeded.code, 1, `seed should fail: ${seeded.stdout}${seeded.stderr}`);
    assert.match(seeded.stdout, /^FAIL /);
    const solved = await runCheck(task.id, await workdirWith(task.id, 'solution'));
    assert.equal(solved.code, 0, `solution should pass: ${solved.stdout}${solved.stderr}`);
    assert.match(solved.stdout, /^PASS/);
  });
}
