import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadValueTasks, prepareValueRepo, scoreValueRepo } from '../benchmarks/value.mjs';

const QUICK_SLUGS = ['test-pollution', 'rename-propagation', 'export-mismatch', 'web-research'];
const tasks = loadValueTasks().filter((task) => QUICK_SLUGS.includes(path.basename(task.directory)));

async function scoreRepoWith(task, solved) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-value-reference-'));
  try {
    const startTree = prepareValueRepo(task, repo);
    if (solved) fs.cpSync(path.join(task.directory, 'solution'), repo, { recursive: true, force: true });
    return await scoreValueRepo(task, repo, startTree);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test('every quick value task is found', () => {
  assert.deepEqual(tasks.map((task) => path.basename(task.directory)).sort(), [...QUICK_SLUGS].sort());
});

for (const task of tasks) {
  test(`${task.id} check.mjs fails its seed`, async () => {
    const verdict = await scoreRepoWith(task, false);
    assert.equal(verdict.harnessError, undefined);
    assert.equal(verdict.pass, false, `seed passed: ${verdict.detail}`);
  });

  test(`${task.id} check.mjs passes its solution`, async () => {
    const verdict = await scoreRepoWith(task, true);
    assert.equal(verdict.harnessError, undefined);
    assert.equal(verdict.pass, true, `solution failed: ${verdict.detail}`);
  });
}
