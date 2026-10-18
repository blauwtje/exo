import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { prepareBuildRepository, prepareReviewBranch } from '../benchmarks/sweep-fixtures.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';

const REAL_SAFE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'safe');

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

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
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-fixtures-'));
  try {
    const safe = strayCopy(tmp);
    for (const task of SAFE_TASKS) {
      for (const source of ['seed', 'solution']) {
        const repo = path.join(tmp, `${task.id}-${source}`);
        fs.mkdirSync(repo);
        prepareReviewBranch(repo, task, source, safe);
        const changed = git(repo, ['diff', '--name-only', 'main...HEAD']).split('\n');
        assert.deepEqual(changed, [task.file], `${task.id}/${source}`);
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('build repositories of every safe task hold only the task file, despite stray files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sweep-fixtures-'));
  try {
    const safe = strayCopy(tmp);
    for (const task of SAFE_TASKS) {
      const repo = path.join(tmp, `${task.id}-build`);
      fs.mkdirSync(repo);
      prepareBuildRepository(repo, task, safe);
      assert.deepEqual(git(repo, ['ls-files']).split('\n'), [task.file], task.id);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the real safe fixtures hold only the task file in each seed and solution folder', () => {
  for (const task of SAFE_TASKS) {
    for (const source of ['seed', 'solution']) {
      assert.deepEqual(fs.readdirSync(path.join(REAL_SAFE, task.id, source)), [task.file], `${task.id}/${source}`);
    }
  }
});
