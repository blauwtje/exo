// plan-tasks.mjs landedTasks: which plan tasks a checkout's commits landed,
// by trailer and subject, since the branch left the default branch.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { landedTasks, parsePlan } from '#plan-tasks';
import { compactTask, git, gitRepository, planFixture, taskSection } from './harness.mjs';

test('a task lands with its trailer and its own commit subject, never with an earlier plan\'s trailer', async () => {
  const root = await gitRepository({ 'src/app.js': 'export function greet() {}\n' });
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Wave', dependsOn: 'Task 1', files: ['- Create: `src/wave.js`'], subject: 'feat(app): wave' })
  ] }));
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(old): an earlier plan', '-m', 'Plan-task: 2');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), [1]);
});

test('a Plan-task: <plan-id>/<n> trailer lands only the task of the plan it names', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `a.js`'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'feat(app): wave', files: ['- Create: `b.js`'], commit: false })
  ] }));
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(other): something else', '-m', 'Plan-task: other-plan/1');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(other): more', '-m', 'Plan-task: other-plan/2');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): a subject the plan does not give', '-m', 'Plan-task: fixture/2');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), [2]);
});

test('a legacy bare Plan-task: <n> lands a compact task only beside its heading subject', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  const { tasks } = parsePlan(planFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['a.js'] }),
    compactTask({ number: 2, title: 'feat(app): wave', files: ['b.js'] })
  ] }));
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(old): an earlier plan\'s task 1', '-m', 'Plan-task: 1');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), []);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): wave', '-m', 'Plan-task: 2');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), [2]);
});

test('landed counts only commits on this branch since it left the default branch', async () => {
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `a.js`'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Bare', files: ['- Create: `b.js`'], subject: 'feat(app): bare', commit: false })
  ] }));
  for (const remote of [true, false]) {
    const root = await gitRepository({ 'a.txt': 'a\n' });
    git(root, 'commit', '-q', '--allow-empty', '-m', 'chore: older plan', '-m', 'Plan-task: fixture/2');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
    if (remote) {
      git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    }
    git(root, 'switch', '-q', '-c', 'feat/fixture');
    assert.deepEqual(landedTasks(tasks, root, 'fixture'), [], `remote: ${remote}`);
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): bare', '-m', 'Plan-task: fixture/2');
    assert.deepEqual(landedTasks(tasks, root, 'fixture'), [2], `remote: ${remote}`);
  }
});

test('a run on the default branch itself keeps the tasks it already pushed', async () => {
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `a.js`'], subject: 'feat(app): greet' })
  ] }));
  const root = await gitRepository({ 'a.txt': 'a\n' });
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  assert.deepEqual(landedTasks(tasks, root, 'fixture'), [1]);
});
