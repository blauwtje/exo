import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { compactPlanFixture, compactTask } from './harness.mjs';
import { nextTaskReport } from '../skills/build/scripts/next-task.mjs';
import { landingCheckout } from './land-task-fixture.mjs';

function planOf(dependsOn) {
  return compactPlanFixture({ tasks: dependsOn.map((depends, index) => compactTask({
    number: index + 1,
    title: `feat(app): step ${index + 1}`,
    dependsOn: depends,
    files: ['src/app.js']
  })) });
}

async function routeOf(plan) {
  const { root } = await landingCheckout();
  const report = nextTaskReport({ planText: plan, planPath: path.join(root, 'docs/plans/fixture.md'), root });
  return report.split('\n')[2];
}

test('a chain of three tasks routes to this session', async () => {
  assert.equal(await routeOf(planOf(['none', 'Task 1', 'Task 2'])), 'Route: this session');
});

test('a one-task plan routes to this session', async () => {
  assert.equal(await routeOf(planOf(['none'])), 'Route: this session');
});

test('a chain of four tasks routes to a builder', async () => {
  assert.equal(await routeOf(planOf(['none', 'Task 1', 'Task 2', 'Task 3'])), 'Route: builder');
});

test('independent tasks route to a builder', async () => {
  assert.equal(await routeOf(planOf(['none', 'none'])), 'Route: builder');
});

test('EXO_SELF_BUILD_TASKS raises the task limit', async () => {
  process.env.EXO_SELF_BUILD_TASKS = '4';
  try {
    assert.equal(await routeOf(planOf(['none', 'Task 1', 'Task 2', 'Task 3'])), 'Route: this session');
  } finally {
    delete process.env.EXO_SELF_BUILD_TASKS;
  }
});
