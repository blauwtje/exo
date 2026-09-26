// plan-tasks.mjs reads a plan as define-scope writes it and asks the checkout
// which tasks landed, so next-task.mjs and land-task.mjs share one grammar.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { driftOf, frameOf, landedTasks, nextWave, parsePlan, PlanError, regionRange } from '#plan-tasks';
import { compactPlanFixture, compactTask, fixture, git, gitRepository, planFixture, taskSection } from './harness.mjs';

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

test('a commit subject reads the same through bash escapes and single quotes', () => {
  const subjectOf = (commitLine) => parsePlan([
    '### Task 1: Quote', '', 'Commit:', '```bash', 'git add .', commitLine, '```', ''
  ].join('\n')).tasks[0].commitSubject;
  assert.equal(subjectOf('git commit -m "feat: say \\"hi\\"" -m "Plan-task: 1"'), 'feat: say "hi"');
  assert.equal(subjectOf("git commit -m 'feat: single' -m 'Plan-task: 1'"), 'feat: single');
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

test('the wave is the current task plus every further ready task without Design: whose files are disjoint from the wave, up to four, only when the plan allows one', () => {
  const four = [1, 2, 3, 4].map((number) => taskSection({
    number, title: `T${number}`, design: number === 2, files: [`- Create: \`f${number}\``], subject: `feat: t${number}`
  }));
  const withSetup = parsePlan(planFixture({ worktreeSetup: 'none', tasks: four }));
  assert.deepEqual(nextWave(withSetup.tasks, [], 'none').map((task) => task.number), [1, 3, 4]);
  assert.deepEqual(nextWave(withSetup.tasks, [1, 3, 4], 'none').map((task) => task.number), [2]);
  assert.deepEqual(nextWave(withSetup.tasks, [], null).map((task) => task.number), [1]);
  assert.deepEqual(nextWave(withSetup.tasks, [1, 2, 3, 4], 'none'), []);
  const three = parsePlan(planFixture({ worktreeSetup: 'none', tasks: four.slice(0, 3) }));
  assert.deepEqual(nextWave(three.tasks, [], 'none').map((task) => task.number), [1]);
});

test('four disjoint ready tasks form a wave of four', () => {
  const tasks = [1, 2, 3, 4].map((number) => taskSection({
    number, title: `T${number}`, files: [`- Create: \`f${number}\``], subject: `feat: t${number}`
  }));
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks }));
  assert.deepEqual(nextWave(plan.tasks, [], 'none').map((task) => task.number), [1, 2, 3, 4]);
});

test('a fifth disjoint ready task stays out of the wave', () => {
  const tasks = [1, 2, 3, 4, 5].map((number) => taskSection({
    number, title: `T${number}`, files: [`- Create: \`f${number}\``], subject: `feat: t${number}`
  }));
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks }));
  assert.deepEqual(nextWave(plan.tasks, [], 'none').map((task) => task.number), [1, 2, 3, 4]);
});

test('a ready task sharing a path with an earlier wave member is skipped while a later disjoint one joins', () => {
  const tasks = [
    taskSection({ number: 1, title: 'T1', files: ['- Create: `shared.js`'], subject: 'feat: t1' }),
    taskSection({ number: 2, title: 'T2', files: ['- Create: `shared.js`'], subject: 'feat: t2' }),
    taskSection({ number: 3, title: 'T3', files: ['- Create: `f3.js`'], subject: 'feat: t3' }),
    taskSection({ number: 4, title: 'T4', files: ['- Create: `f4.js`'], subject: 'feat: t4' })
  ];
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks }));
  assert.deepEqual(nextWave(plan.tasks, [], 'none').map((task) => task.number), [1, 3, 4]);
});

test('a wave stays solo when the current task itself names no files', () => {
  const tasks = [
    taskSection({ number: 1, title: 'T1', files: [], subject: 'feat: t1' }),
    taskSection({ number: 2, title: 'T2', files: ['- Create: `f2.js`'], subject: 'feat: t2' }),
    taskSection({ number: 3, title: 'T3', files: ['- Create: `f3.js`'], subject: 'feat: t3' }),
    taskSection({ number: 4, title: 'T4', files: ['- Create: `f4.js`'], subject: 'feat: t4' })
  ];
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks }));
  assert.deepEqual(nextWave(plan.tasks, [], 'none').map((task) => task.number), [1]);
});

test('a task with no file paths stays out of the wave', () => {
  const tasks = [
    taskSection({ number: 1, title: 'T1', files: ['- Create: `f1.js`'], subject: 'feat: t1' }),
    taskSection({ number: 2, title: 'T2', files: [], subject: 'feat: t2' }),
    taskSection({ number: 3, title: 'T3', files: ['- Create: `f3.js`'], subject: 'feat: t3' }),
    taskSection({ number: 4, title: 'T4', files: ['- Create: `f4.js`'], subject: 'feat: t4' })
  ];
  const plan = parsePlan(planFixture({ worktreeSetup: 'none', tasks }));
  assert.deepEqual(nextWave(plan.tasks, [], 'none').map((task) => task.number), [1, 3, 4]);
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

const bare = (number, dependsOn) => taskSection({ number, title: `T${number}`, dependsOn, files: [`- Create: \`a${number}.js\``], subject: `feat: t${number}` });

test('Depends on: reads every number of a list, in each form define-scope writes', () => {
  const dependsOf = (dependsOn) => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'none'), bare(3, dependsOn)] })).tasks[2].dependsOn;
  assert.deepEqual(dependsOf('Task 1, Task 2'), [1, 2]);
  assert.deepEqual(dependsOf('Task 1, 2'), [1, 2]);
  assert.deepEqual(dependsOf('Tasks 1 and 2'), [1, 2]);
  assert.deepEqual(dependsOf('Task 2 (only for the sizes quoted in `Expected:`)'), [2]);
});

test('a wave never pairs a task with a task it depends on', () => {
  const plan = parsePlan(planFixture({ worktreeSetup: 'npm ci', tasks: [bare(1, 'none'), bare(2, 'none'), bare(3, 'Task 1, 2'), bare(4, 'Task 3')] }));
  assert.deepEqual(nextWave(plan.tasks, [1], 'npm ci').map((task) => task.number), [2]);
});

test('a plan whose tasks cannot all be ordered is refused with the tasks and the reason', () => {
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'Task 3'), bare(3, 'Task 2')] })), { name: 'PlanError', message: /cycle: Task 2 -> Task 3 -> Task 2/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'Task 9')] })), { name: 'PlanError', message: /Task 2 depends on Task 9, which the plan does not hold/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(1, 'none'), bare(2, 'Task 1')] })), { name: 'PlanError', message: /two tasks are numbered 1/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'none').replace('### Task 2: T2', '### Task 2 - T2'), bare(3, 'none')] })), { name: 'PlanError', message: /'### Task 2 - T2' does not read '### Task <n>: <title>'/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'after Task 1')] })), { name: 'PlanError', message: /Task 2: 'Depends on: after Task 1'/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'none'), bare(2, 'none'), bare(3, 'Task 1 (schema), Task 2 (api)')] })), { name: 'PlanError', message: /Task 3: 'Depends on: Task 1 \(schema\), Task 2 \(api\)'/ });
  assert.throws(() => parsePlan(planFixture({ tasks: [bare(1, 'Task 1')] })), PlanError);
});

test('landed counts only commits on this branch since it left the default branch', async () => {
  const { tasks } = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Create: `a.js`'], subject: 'feat(app): greet' }),
    taskSection({ number: 2, title: 'Bare', files: ['- Create: `b.js`'], subject: 'feat(app): bare', commit: false })
  ] }));
  for (const remote of [true, false]) {
    const root = await gitRepository({ 'a.txt': 'a\n' });
    git(root, 'commit', '-q', '--allow-empty', '-m', 'chore: older plan', '-m', 'Plan-task: 2');
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: 1');
    if (remote) {
      git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
      git(root, 'symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    }
    git(root, 'switch', '-q', '-c', 'feat/fixture');
    assert.deepEqual(landedTasks(tasks, root), [], `remote: ${remote}`);
    git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): bare', '-m', 'Plan-task: 2');
    assert.deepEqual(landedTasks(tasks, root), [2], `remote: ${remote}`);
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
  assert.deepEqual(landedTasks(tasks, root), [1]);
});

test('driftOf finds a region declared as a method, getter, type or in another language', async () => {
  const root = await fixture();
  const declarations = {
    'class method': ['class A {\n  handle(req) {\n    return 1;\n  }\n}\n', 'handle'],
    'typed method': ['class A {\n  handle(req: Request): Promise<void> {\n  }\n}\n', 'handle'],
    'TS interface': ['export interface Props {\n  a: string;\n}\n', 'Props'],
    'TS type': ['export type Props = { a: string };\n', 'Props'],
    'TS enum': ['export enum Color { Red }\n', 'Color'],
    'Go method': ['func (s *Server) Handle(w http.ResponseWriter) {\n}\n', 'Handle'],
    'Rust pub(crate)': ['pub(crate) fn parse() {}\n', 'parse'],
    getter: ['class A {\n  get total() { return 1; }\n}\n', 'total'],
    'plain function': ['export function load() {}\nload();\n', 'load']
  };
  for (const [name, [source, region]] of Object.entries(declarations)) {
    await fs.writeFile(path.join(root, 'f.ts'), source);
    const task = parsePlan(planFixture({ tasks: [
      taskSection({ number: 1, title: 'Edit', files: [`- Modify: \`f.ts\` (\`${region}\`)`], subject: 'feat: edit' })
    ] })).tasks[0];
    assert.deepEqual(driftOf(task, root), [], name);
  }
  await fs.writeFile(path.join(root, 'f.ts'), 'handle(req, () => {\n});\n');
  const called = parsePlan(planFixture({ tasks: [
    taskSection({ number: 1, title: 'Edit', files: ['- Modify: `f.ts` (`handle`)'], subject: 'feat: edit' })
  ] })).tasks[0];
  assert.deepEqual(driftOf(called, root), ['region `handle` is missing from `f.ts`']);
});

test('a compact field line reads its dependencies, files, data, design and proof', () => {
  const plan = parsePlan(compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js', 'src/app.test.js'], proof: 'node --test -- app.test' }),
    compactTask({ number: 2, title: 'feat(app): style', dependsOn: '1', files: ['src/app.css'], data: 'a CSS module', design: 'design-ui' })
  ] }));
  assert.deepEqual(plan.tasks.map((task) => task.number), [1, 2]);
  assert.deepEqual(plan.tasks[0].dependsOn, []);
  assert.deepEqual(plan.tasks[0].files, [
    { kind: null, path: 'src/app.js', region: null },
    { kind: null, path: 'src/app.test.js', region: null }
  ]);
  assert.equal(plan.tasks[0].compact, true);
  assert.equal(plan.tasks[0].commitBlock, null);
  assert.equal(plan.tasks[0].proof, 'node --test -- app.test');
  assert.equal(plan.tasks[1].dependsOn.length, 1);
  assert.deepEqual(plan.tasks[1].dependsOn, [1]);
  assert.equal(plan.tasks[1].design, true);
  assert.equal(plan.tasks[0].design, false);
});

test('a compact task with no Proof: segment reads proof as null', () => {
  const plan = parsePlan(compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: null })
  ] }));
  assert.equal(plan.tasks[0].proof, null);
});

test('an old-format task still parses beside a compact one in the same plan', () => {
  const plan = parsePlan(compactPlanFixture({ tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' }),
    compactTask({ number: 2, title: 'feat(app): style', dependsOn: '1', files: ['src/app.css'] })
  ] }));
  assert.equal(plan.tasks[0].compact, false);
  assert.equal(plan.tasks[1].compact, true);
  assert.deepEqual(plan.tasks[1].dependsOn, [1]);
});

test('regionRange gives the 1-based start and end of a region\'s definition block', () => {
  const content = 'const a = 1;\nexport function greet() {\n  return "hi";\n}\nconst b = 2;\n';
  assert.deepEqual(regionRange(content, 'greet'), { start: 2, end: 4 });
  assert.equal(regionRange(content, 'missing'), null);
});
