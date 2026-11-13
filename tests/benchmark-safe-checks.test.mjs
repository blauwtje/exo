import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';
import { tempDir } from './harness.mjs';

const SAFE = path.join(import.meta.dirname, '..', 'benchmarks', 'safe');

function verdict(task, source) {
  const directory = tempDir('exo-safe-check-');
  fs.copyFileSync(path.join(SAFE, task.id, source, task.file), path.join(directory, task.file));
  return spawnSync(process.execPath, [path.join(SAFE, task.id, 'check.mjs'), directory], { encoding: 'utf8', timeout: 30000 });
}

for (const task of SAFE_TASKS) {
  test(`${task.id} check passes its solution and fails its seed`, () => {
    assert.equal(verdict(task, 'solution').status, 0);
    assert.equal(verdict(task, 'seed').status, 1);
  });
}
