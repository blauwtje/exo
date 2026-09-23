// next-task.mjs prints the landed set, the next task or wave, and for each of
// its tasks the frame fields, the drift of its Modify: regions and its section,
// read from the plan and the checkout rather than the session's memory.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { nextTaskReport } from '../skills/implementing/scripts/next-task.mjs';
import { git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/implementing/scripts/next-task.mjs', import.meta.url));

const PLAN = planFixture({ worktreeSetup: 'none', tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], code: 'export function greet() {\n  return "hello";\n}', subject: 'feat(app): greet' }),
  taskSection({ number: 2, title: 'Style', dependsOn: 'Task 1', design: true, files: ['- Create: `src/app.css`'], subject: 'feat(app): style' }),
  taskSection({ number: 3, title: 'Wave', files: ['- Create: `src/wave.js`'], subject: 'feat(app): wave' }),
  taskSection({ number: 4, title: 'Tail', dependsOn: 'Task 2, Task 3', files: ['- Create: `src/tail.js`'], subject: 'feat(app): tail' })
] });

async function checkout() {
  const root = await gitRepository({
    'src/app.js': 'export function greet() {\n  return "hi";\n}\n',
    'docs/plans/fixture.md': PLAN
  });
  return { root, planPath: path.join(root, 'docs/plans/fixture.md') };
}

function land(root, number, subject) {
  git(root, 'commit', '-q', '--allow-empty', '-m', subject, '-m', `Plan-task: ${number}`);
}

test('with nothing landed, the report names the first wave with its frame, sections and no drift', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Branch: feat\/fixture$/m);
  assert.match(report, /^Landed: none$/m);
  assert.match(report, /^Wave: Task 1, Task 3$/m);
  assert.match(report, /^Goal: The fixture proves the plan reader\.$/m);
  assert.match(report, /^- `src\/app\.js` exports `greet`\.$/m);
  assert.match(report, /^Visual direction: none$/m);
  assert.match(report, /^Drift: none$/m);
  assert.match(report, /^### Task 1: Greet$/m);
  assert.match(report, /^### Task 3: Wave$/m);
  assert.doesNotMatch(report, /^### Task 2: Style$/m);
});

test('a landed task leaves the report, and a Design: task builds alone with the visual direction', async () => {
  const { root, planPath } = await checkout();
  land(root, 1, 'feat(app): greet');
  land(root, 3, 'feat(app): wave');
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Landed: 1, 3$/m);
  assert.match(report, /^Next: Task 2$/m);
  assert.match(report, /^Visual direction:\nDesign skill: designing$/m);
  assert.doesNotMatch(report, /^### Task 4: Tail$/m);
});

test('drift in a Modify: region is a PLAN DRIFT line for that task', async () => {
  const { root, planPath } = await checkout();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "hello";\n}\n');
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^PLAN DRIFT: Task 1: region `greet` is already changed in `src\/app\.js`$/m);
});

test('every task landed ends the run', async () => {
  const { root, planPath } = await checkout();
  land(root, 1, 'feat(app): greet');
  land(root, 3, 'feat(app): wave');
  land(root, 2, 'feat(app): style');
  land(root, 4, 'feat(app): tail');
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Landed: 1, 2, 3, 4$/m);
  assert.match(report, /^Next: none, every task landed$/m);
});

test('the command line reads the plan and the checkout, and refuses a missing plan', async () => {
  const { root, planPath } = await checkout();
  const good = await run(SCRIPT, ['--plan', planPath, '--root', root], { cwd: root });
  assert.equal(good.code, 0, good.stderr);
  assert.match(good.stdout, /^Wave: Task 1, Task 3$/m);
  const missing = await run(SCRIPT, ['--plan', path.join(root, 'nope.md')], { cwd: root });
  assert.equal(missing.code, 2);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /no plan at/);
});
