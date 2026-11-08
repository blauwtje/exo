import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareBuildRepository, prepareReviewBranch } from '../benchmarks/sweep-fixtures.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';
import { git, tempDir } from './harness.mjs';

const REAL_SAFE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'safe');

// A copy of the fixtures with one stray file (as a check.mjs proof run leaves)
// in every seed and solution folder.
function strayCopy(tmp) {
  const safe = path.join(tmp, 'safe');
  fs.cpSync(REAL_SAFE, safe, { recursive: true });
  for (const task of SAFE_TASKS) {
    for (const source of ['seed', 'solution']) fs.writeFileSync(path.join(safe, task.id, source, 'stray.csv'), 'x\n');
  }
  return safe;
}

test('review branches of every safe task change only the task file, despite stray files', () => {
  const tmp = tempDir('sweep-fixtures-');
  const safe = strayCopy(tmp);
  for (const task of SAFE_TASKS) {
    for (const source of ['seed', 'solution']) {
      const repo = path.join(tmp, `${task.id}-${source}`);
      fs.mkdirSync(repo);
      prepareReviewBranch(repo, task, source, safe);
      const changed = git(repo, 'diff', '--name-only', 'main...HEAD').split('\n');
      assert.deepEqual(changed, [task.file], `${task.id}/${source}`);
    }
  }
});

test('build repositories of every safe task hold only the task file, despite stray files', () => {
  const tmp = tempDir('sweep-fixtures-');
  const safe = strayCopy(tmp);
  for (const task of SAFE_TASKS) {
    const repo = path.join(tmp, `${task.id}-build`);
    fs.mkdirSync(repo);
    prepareBuildRepository(repo, task, safe);
    assert.deepEqual(git(repo, 'ls-files').split('\n'), [task.file], task.id);
  }
});

test('the real safe fixtures hold only the task file in each seed and solution folder', () => {
  for (const task of SAFE_TASKS) {
    for (const source of ['seed', 'solution']) {
      assert.deepEqual(fs.readdirSync(path.join(REAL_SAFE, task.id, source)), [task.file], `${task.id}/${source}`);
    }
  }
});

test('flow-web cells prepare a generated repository and match cell-steps.json', async () => {
  const { allCells, prepareRepository } = await import('../benchmarks/sweep.mjs');
  const steps = JSON.parse(fs.readFileSync(path.join(REAL_SAFE, '..', 'cell-steps.json'), 'utf8'));
  const cells = allCells().filter((cell) => cell.fixture === 'flow-web');
  assert.deepEqual(cells.map((cell) => cell.id), ['flow-web', 'flow-web-build', 'flow-web-review']);
  for (const cell of cells) assert.ok(steps[cell.id], cell.id);
  const build = tempDir('flow-web-');
  prepareRepository({ ...cells[0], fixtureProfile: 'small' }, build, null);
  assert.ok(fs.existsSync(path.join(build, 'TASK.md')));
  const review = tempDir('flow-web-');
  prepareRepository({ ...cells[2], fixtureProfile: 'small' }, review, null);
  assert.deepEqual(git(review, 'diff', '--name-only', 'main...HEAD').split('\n').includes('TASK.md'), true);
});

test('flow-large prepares a repository whose plan holds six tasks', async () => {
  const { allCells, prepareRepository } = await import('../benchmarks/sweep.mjs');
  const large = allCells().find((cell) => cell.id === 'flow-large');
  const repository = tempDir('flow-large-');
  prepareRepository(large, repository, tempDir('flow-large-origin-'));
  const plan = fs.readFileSync(path.join(repository, 'docs/plans/text-helpers.md'), 'utf8');
  assert.equal(plan.match(/^### Task \d+:/gm).length, 6);
});
