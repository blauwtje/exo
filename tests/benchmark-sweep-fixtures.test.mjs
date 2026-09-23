// The sweep's starting repositories: a review branch whose diff against main is
// exactly the fixture's seed or solution, a build repository holding the seed,
// and the text library the plan and whole-flow cells change.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, git } from './harness.mjs';
import {
  FLOW_BRANCH, FLOW_HELPERS, FLOW_PLAN, FLOW_TASK_COUNT,
  prepareBuildRepository, prepareFlowRepository, prepareReviewBranch
} from '../benchmarks/sweep-fixtures.mjs';
import { SAFE_TASKS } from '../benchmarks/tasks.mjs';

const SAFE = fileURLToPath(new URL('../benchmarks/safe/', import.meta.url));

async function emptyRepository() {
  const root = await fs.realpath(await fixture());
  const repository = path.join(root, 'repo');
  await fs.mkdir(repository);
  return { root, repository };
}

// The outer `node --test` sets NODE_TEST_CONTEXT, which would turn the inner
// run into a child reporter instead of a suite of its own.
function nodeTest(directory) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return new Promise((resolve) => {
    execFile(process.execPath, ['--test'], { cwd: directory, env, timeout: 60_000 },
      (error, stdout, stderr) => resolve({ code: error ? 1 : 0, output: `${stdout}${stderr}` }));
  });
}

for (const task of SAFE_TASKS) {
  test(`${task.id}: the review branch adds the seed on top of the plan on main`, async () => {
    const { repository } = await emptyRepository();
    prepareReviewBranch(repository, task, 'seed');
    assert.equal(git(repository, 'branch', '--show-current'), `feat/${task.id}`);
    assert.equal(git(repository, 'diff', '--name-only', 'main...HEAD'), task.file);
    const seed = await fs.readFile(path.join(SAFE, task.id, 'seed', task.file), 'utf8');
    assert.equal(git(repository, 'show', `HEAD:${task.file}`), seed.trim());
    const plan = git(repository, 'show', `main:docs/plans/${task.id}.md`);
    assert.match(plan, /^## Goal$/m);
    assert.ok(plan.includes(task.prompt));
  });
}

test('a control branch carries the reference solution', async () => {
  const task = SAFE_TASKS[0];
  const { repository } = await emptyRepository();
  prepareReviewBranch(repository, task, 'solution');
  const solution = await fs.readFile(path.join(SAFE, task.id, 'solution', task.file), 'utf8');
  assert.equal(git(repository, 'show', `HEAD:${task.file}`), solution.trim());
});

test('a build repository holds the seed in one clean commit on main', async () => {
  const task = SAFE_TASKS[0];
  const { repository } = await emptyRepository();
  prepareBuildRepository(repository, task);
  assert.equal(git(repository, 'branch', '--show-current'), 'main');
  assert.equal(git(repository, 'ls-files'), task.file);
  assert.equal(git(repository, 'status', '--porcelain'), '');
});

test('the flow repository has origin/main, the fixed plan and a passing seed suite', async () => {
  const { root, repository } = await emptyRepository();
  prepareFlowRepository(repository, path.join(root, 'origin.git'), true);
  assert.equal(git(repository, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'), 'origin/main');
  const plan = await fs.readFile(path.join(repository, FLOW_PLAN), 'utf8');
  assert.ok(plan.includes(`Repository: ${repository}\n`));
  assert.ok(plan.includes(`Branch: ${FLOW_BRANCH}\n`));
  assert.equal(plan.match(/^### Task \d+:/gm).length, FLOW_TASK_COUNT);
  assert.equal(plan.match(/-m "Plan-task: \d+"/g).length, FLOW_TASK_COUNT);
  const suite = await nodeTest(repository);
  assert.equal(suite.code, 0, suite.output);
});

test('the plan cells start from the same library without a plan', async () => {
  const { root, repository } = await emptyRepository();
  prepareFlowRepository(repository, path.join(root, 'origin.git'), false);
  await assert.rejects(fs.access(path.join(repository, 'docs')));
  assert.equal(git(repository, 'ls-files'), 'package.json\nsrc/words.js\nsrc/words.test.js');
});

test('the fixed plan code passes the library suite once every task is applied', async () => {
  const { root, repository } = await emptyRepository();
  prepareFlowRepository(repository, path.join(root, 'origin.git'), true);
  for (const helper of FLOW_HELPERS) {
    await fs.writeFile(path.join(repository, helper.module), `${helper.code.join('\n')}\n`);
    await fs.writeFile(path.join(repository, helper.test), `${helper.testCode.join('\n')}\n`);
  }
  const suite = await nodeTest(repository);
  assert.equal(suite.code, 0, suite.output);
  assert.match(suite.output, /pass 5/);
});
