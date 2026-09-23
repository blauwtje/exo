// plan-tasks.mjs reads a plan as planning writes it and asks the checkout
// which tasks landed, so next-task.mjs and land-task.mjs share one grammar.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { driftOf, frameOf, landedTasks, nextWave, parsePlan } from '../skills/implementing/scripts/plan-tasks.mjs';
import { fixture, git, gitRepository, planFixture, taskSection } from './harness.mjs';

test('parsePlan reads the frame and each task\'s dependencies, files and commit subject', () => {
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)', '- Test: `src/app.test.js`'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Style', dependsOn: 'Task 1', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' })
  ] }));
  assert.equal(plan.frame.Goal, 'The fixture proves the plan reader.');
  assert.deepEqual(frameOf(plan.frame).nonGoals, ['`src/other.js` stays as it is.']);
  assert.equal(frameOf(plan.frame).worktreeSetup, 'none');
  assert.equal(frameOf(plan.frame).branch, 'feat/fixture');
  assert.deepEqual(plan.tasks.map((task) => task.number), [1, 2]);
  assert.deepEqual(plan.tasks[0].files, [
    { kind: 'Modify', path: 'src/app.js', region: 'greet' },
    { kind: 'Test', path: 'src/app.test.js', region: null }
  ]);
  assert.deepEqual(plan.tasks[0].dependsOn, []);
  assert.deepEqual(plan.tasks[1].dependsOn, [1]);
  assert.equal(plan.tasks[0].design, false);
  assert.equal(plan.tasks[1].design, true);
  assert.equal(plan.tasks[0].commitSubject, 'feat(app): greet');
  assert.ok(plan.tasks[0].section.startsWith('### Task 1: Greet'));
  assert.ok(!plan.tasks[1].section.includes('## Final verification'));
});

test('a task heading inside a fence is code, not a task', () => {
  const inner = '### Task 9: Not a task';
  const plan = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `a.md`'], code: inner, subject: 'docs: a' })
  ] }));
  assert.deepEqual(plan.tasks.map((task) => task.number), [1]);
  assert.ok(plan.tasks[0].section.includes(inner));
});

test('a task lands with its trailer and its own commit subject, never with an earlier plan\'s trailer', async () => {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Wave', dependsOn: 'Task 1', files: ['- Create: `src/wave.js`'], subject: 'feat(app): wave' })
  ] }));
  assert.deepEqual(landedTasks(tasks, root), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(old): an earlier plan', '-m', 'Plan-task: 2');
  assert.deepEqual(landedTasks(tasks, root), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  assert.deepEqual(landedTasks(tasks, root), [1]);
});

test('the wave is the current task plus the next ready task without Design:, only when the plan allows one', () => {
  const four = [1, 2, 3, 4].map((number) => taskSection({
    number, title: `T${number}`, design: number === 2, files: ['- Create: `f`'], subject: `feat: t${number}`
  }));
  const withSetup = parsePlan(planFixture({ worktreeSetup: 'none', tasks: four }));
  assert.deepEqual(nextWave(withSetup.tasks, [], 'none').map((task) => task.number), [1, 3]);
  assert.deepEqual(nextWave(withSetup.tasks, [1, 3], 'none').map((task) => task.number), [2]);
  assert.deepEqual(nextWave(withSetup.tasks, [], null).map((task) => task.number), [1]);
  assert.deepEqual(nextWave(withSetup.tasks, [1, 2, 3, 4], 'none'), []);
  const three = parsePlan(planFixture({ worktreeSetup: 'none', tasks: four.slice(0, 3) }));
  assert.deepEqual(nextWave(three.tasks, [], 'none').map((task) => task.number), [1]);
});

test('driftOf reports a Modify: region that is missing, duplicated or already changed', async () => {
  const root = await fixture();
  const target = path.join(root, 'app.js');
  await fs.writeFile(target, 'export function greet() {\n  return "hi";\n}\ngreet();\n');
  const code = 'export function greet() {\n  return "hello";\n}';
  const task = (region, file = 'app.js') => parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: [`- Modify: \`${file}\` (\`${region}\`)`], code, subject: 'feat: greet' })
  ] })).tasks[0];
  assert.deepEqual(driftOf(task('greet'), root), []);
  assert.deepEqual(driftOf(task('wave'), root), ['region `wave` is missing from `app.js`']);
  assert.deepEqual(driftOf(task('greet', 'gone.js'), root), ['`gone.js` is missing']);
  await fs.appendFile(target, 'export function greet() {}\n');
  assert.deepEqual(driftOf(task('greet'), root), ['region `greet` is duplicated in `app.js`']);
  await fs.writeFile(target, `${code}\n`);
  assert.deepEqual(driftOf(task('greet'), root), ['region `greet` is already changed in `app.js`']);
});
