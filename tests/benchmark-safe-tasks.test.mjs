import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SAFE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'safe');
const TASKS = fs.readdirSync(SAFE, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);

function verdict(task, variant) {
  const workdir = fs.mkdtempSync(path.join(os.tmpdir(), 'safe-task-'));
  try {
    fs.cpSync(path.join(SAFE, task, variant), workdir, { recursive: true });
    const run = spawnSync(process.execPath, [path.join(SAFE, task, 'check.mjs'), workdir], { encoding: 'utf8' });
    return { status: run.status, output: run.stdout.trim() };
  } finally {
    fs.rmSync(workdir, { recursive: true, force: true });
  }
}

test('the safe tasks are found', () => {
  assert.ok(TASKS.length > 0);
});

for (const task of TASKS) {
  test(`${task}: the check fails the seed`, () => {
    const { status, output } = verdict(task, 'seed');
    assert.equal(status, 1, output);
    assert.match(output, /^FAIL /);
  });

  test(`${task}: the check passes the solution`, () => {
    const { status, output } = verdict(task, 'solution');
    assert.equal(status, 0, output);
    assert.equal(output, 'PASS');
  });
}
