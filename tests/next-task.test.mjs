// next-task.mjs prints each dispatchable task's filled implementer prompt and
// Since: epoch; with --open-slots it opens a Wave's slot worktrees and the
// baseline itself, discards the wave when a slot fails, and prints the exact
// wait and land commands. land-task --next swaps its Then: line for that report.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { excludeScratch } from '../lib/scratch-exclude.mjs';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { commitFiles, git, planFixture, run } from './harness.mjs';
import { editApp, landingCheckout, SCRIPT as LAND_TASK, taskSection } from './land-task-fixture.mjs';

const NEXT_TASK = new URL('../skills/build/scripts/next-task.mjs', import.meta.url).pathname;

const wavePlan = (worktreeSetup = 'none') => planFixture({ worktreeSetup, parallel: 'every task.', tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'Left', files: ['- Create: `src/left.js`'], subject: 'feat(app): left' }),
  taskSection({ number: 3, title: 'Right', files: ['- Create: `src/right.js`'], subject: 'feat(app): right' }),
  taskSection({ number: 4, title: 'Both', dependsOn: 'Task 2', files: ['- Create: `src/both.js`'], subject: 'feat(app): both' })
] });

// A checkout with Task 1 landed, so the next report names a Wave.
async function afterTaskOne(worktreeSetup) {
  const { root, planPath } = await landingCheckout();
  excludeScratch(root);
  const plan = wavePlan(worktreeSetup);
  await commitFiles(root, { 'docs/plans/fixture.md': plan }, 'chore: plan');
  await editApp(root);
  landTask({ planPath, planText: plan, number: 1, root });
  const next = (...extra) => run(NEXT_TASK, ['--plan', planPath, '--root', root, ...extra], { cwd: root });
  return { root, planPath, plan, next };
}

const worktrees = (root) => git(root, 'worktree', 'list');

test('a Next: task prints Since: and its implementer prompt filled', async () => {
  const { root, planPath } = await landingCheckout();
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Next: Task 1$/m);
  assert.match(result.stdout, /^Dispatch: exo:build-task, run_in_background: false$/m);
  assert.match(result.stdout, /^Since: \d{10}$/m);
  const brief = result.stdout.match(/^Brief: (.+)$/m)[1];
  assert.match(result.stdout, new RegExp(`^Prompt:\\nTask 1 of ${planPath}, branch feat/fixture, checkout ${root}\\.\\nRead your brief at ${brief}\\.\\nReport to: ${root}/\\.exo/implementer-1\\.md\\nReturn: one line$`, 'm'));
});

test('a design task prints no prompt', async () => {
  const plan = planFixture({ tasks: [taskSection({ number: 1, title: 'Look', design: true, files: ['- Create: `src/look.js`'], subject: 'feat(app): look' })] });
  const { root, planPath } = await landingCheckout();
  await commitFiles(root, { 'docs/plans/fixture.md': plan }, 'chore: plan');
  const result = await run(NEXT_TASK, ['--plan', planPath, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Next: Task 1$/m);
  assert.doesNotMatch(result.stdout, /^(?:Prompt|Since|Dispatch):/m);
});

test('a Wave without --open-slots opens nothing and prints no prompt', async () => {
  const { root, next } = await afterTaskOne('none');
  const result = await next();
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  assert.doesNotMatch(result.stdout, /^(?:Prompt|Slot|Wait):/m);
  assert.equal(worktrees(root).split('\n').length, 1);
});

test('--open-slots on a Wave writes the baseline, opens each slot and prints the wait and land commands', async () => {
  const { root, planPath, next } = await afterTaskOne('none');
  await fs.writeFile(path.join(root, 'preexisting.txt'), 'x\n');
  const result = await next('--open-slots');
  assert.equal(result.code, 0, result.stderr);
  const head = git(root, 'rev-parse', 'HEAD');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  assert.match(result.stdout, new RegExp(`^Base: ${head}$`, 'm'));
  assert.equal(await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8'), '?? preexisting.txt\n');
  for (const number of [2, 3]) {
    const slot = `${root}-task-${number}`;
    assert.match(worktrees(root), new RegExp(`${slot} +[0-9a-f]+ \\(detached HEAD\\)`));
    assert.equal(git(slot, 'rev-parse', 'HEAD'), head);
    assert.ok((await fs.stat(path.join(slot, '.exo'))).isDirectory());
    assert.match(result.stdout, new RegExp(`^Slot: ${slot}$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Task ${number} of ${planPath}, branch feat/fixture, checkout ${slot}\\.$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Report to: ${slot}/\\.exo/implementer-${number}\\.md$`, 'm'));
    assert.match(result.stdout, new RegExp(`^Land ${number}: node ".+land-slot\\.mjs" --plan "${planPath}" --task ${number} --root "${root}" --slot "${slot}" --base ${head} --baseline "${root}/\\.exo/baseline\\.txt" --in-flight ${5 - number}$`, 'm'));
  }
  assert.match(result.stdout, /^Dispatch all in one message, run_in_background: true; Since: \d{10}$/m);
  assert.match(result.stdout, /^Wait: node ".+wait-report\.mjs" --any --since \d{10} --report ".+-task-2\/\.exo\/implementer-2\.md" --since \d{10} --report ".+-task-3\/\.exo\/implementer-3\.md"/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), '?? preexisting.txt');
});

test('a failed worktree add discards the wave and the first task builds alone in the run checkout', async () => {
  const { root, next } = await afterTaskOne('none');
  await fs.mkdir(`${root}-task-3`);
  await fs.writeFile(path.join(`${root}-task-3`, 'in-the-way.txt'), 'x\n');
  const result = await next('--open-slots');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Wave discarded: git worktree add .+-task-3 failed/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.doesNotMatch(result.stdout, /^(?:Wave|Slot|Wait):/m);
  assert.match(result.stdout, /^Dispatch: exo:build-task, run_in_background: false$/m);
  assert.match(result.stdout, new RegExp(`checkout ${root}\\.$`, 'm'));
  assert.doesNotMatch(worktrees(root), /-task-2/);
  await assert.rejects(fs.stat(`${root}-task-2`));
});

test('a failing Worktree setup discards the wave', async () => {
  const { root, next } = await afterTaskOne('exit 3');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave discarded: Worktree setup failed in .+-task-2/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.equal(worktrees(root).split('\n').length, 1);
});

test('the Worktree setup command runs inside each slot', async () => {
  const { root, next } = await afterTaskOne('touch setup-ran');
  const result = await next('--open-slots');
  assert.match(result.stdout, /^Wave: Task 2, Task 3$/m);
  for (const number of [2, 3]) assert.ok((await fs.stat(path.join(`${root}-task-${number}`, 'setup-ran'))).isFile());
});

test('a refill opens its slot with its own base, keeps the baseline and prints a wait over every running slot', async () => {
  const { root, next } = await afterTaskOne('none');
  await next('--open-slots');
  const baseline = await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8');
  await fs.writeFile(path.join(root, 'src', 'left.js'), 'export const left = 1;\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'feat(app): left', '-m', 'Plan-task: fixture/2');
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await next('--open-slots', '--in-flight', '3');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Start: Task 4$/m);
  assert.match(result.stdout, new RegExp(`^Land 4: .+--task 4 --root "${root}" --slot "${root}-task-4" --base ${head} .+--in-flight 3$`, 'm'));
  assert.match(result.stdout, /^Wait: .+implementer-3\.md" .+implementer-4\.md"/m);
  assert.equal(await fs.readFile(path.join(root, '.exo', 'baseline.txt'), 'utf8'), baseline);
  assert.match(worktrees(root), new RegExp(`${root}-task-4 `));
});

test('a refill with nothing to start still prints the wait over the running slots', async () => {
  const { next } = await afterTaskOne('none');
  await next('--open-slots');
  const result = await next('--open-slots', '--in-flight', '2,3');
  assert.match(result.stdout, /^Start: none$/m);
  assert.match(result.stdout, /^Wait: .+implementer-2\.md" .+implementer-3\.md"/m);
});

test('land-task --next replaces the Then: line with next-task\'s report', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const result = await run(LAND_TASK, ['--plan', planPath, '--task', '1', '--root', root, '--next'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
  assert.doesNotMatch(result.stdout, /^Then:/m);
  assert.match(result.stdout, /^Next: Task 2$/m);
  assert.match(result.stdout, /^Prompt:\nTask 2 of /m);
});

test('land-task without --next keeps the Then: line', async () => {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const result = await run(LAND_TASK, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.match(result.stdout, /^Then: node ".+next-task\.mjs" --block/m);
  assert.doesNotMatch(result.stdout, /^Prompt:/m);
});
