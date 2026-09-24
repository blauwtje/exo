// next-task.mjs prints the landed set, the next task or wave, and for each of
// its tasks the drift of its Modify: regions and the path of the brief it
// writes with the frame fields and the section, read from the plan and the
// checkout rather than the session's memory.

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

function briefPath(root, number) {
  return path.join(git(root, 'rev-parse', '--absolute-git-dir'), 'exo', 'briefs', `task-${number}.md`);
}

test('with nothing landed, the report names the first wave with no drift and a brief per task', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Branch: feat\/fixture$/m);
  assert.match(report, /^Landed: none$/m);
  assert.match(report, /^Wave: Task 1, Task 3$/m);
  assert.match(report, /^Drift: none$/m);
  assert.ok(report.includes(`\nBrief: ${briefPath(root, 1)}\n`), report);
  assert.ok(report.includes(`\nBrief: ${briefPath(root, 3)}\n`), report);
});

test('the brief file holds the frame and the task section, and the report holds neither', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^Goal: The fixture proves the plan reader\.$/m);
  assert.match(brief, /^- `src\/app\.js` exports `greet`\.$/m);
  assert.match(brief, /^Visual direction: none$/m);
  assert.match(brief, /^Modify ranges:\n- `src\/app\.js:1-3`$/m);
  assert.match(brief, /^### Task 1: Greet$/m);
  assert.ok(brief.includes('export function greet() {\n  return "hello";\n}'), brief);
  assert.doesNotMatch(brief, /^### Task 3: Wave$/m);
  assert.doesNotMatch(report, /^### Task \d+:/m);
  assert.doesNotMatch(report, /^Goal:/m);
  assert.ok(!report.includes('return "hello"'), report);
});

test('a wave of two writes two briefs, and a task outside the wave gets none', async () => {
  const { root, planPath } = await checkout();
  nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(await fs.readFile(briefPath(root, 1), 'utf8'), /^### Task 1: Greet$/m);
  assert.match(await fs.readFile(briefPath(root, 3), 'utf8'), /^### Task 3: Wave$/m);
  await assert.rejects(fs.access(briefPath(root, 2)), { code: 'ENOENT' });
});

test('a landed task leaves the report, and a Design: task builds alone with the visual direction', async () => {
  const { root, planPath } = await checkout();
  land(root, 1, 'feat(app): greet');
  land(root, 3, 'feat(app): wave');
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Landed: 1, 3$/m);
  assert.match(report, /^Next: Task 2$/m);
  assert.match(report, /^Design: designing$/m);
  assert.match(await fs.readFile(briefPath(root, 2), 'utf8'), /^Visual direction:\nDesign skill: designing$/m);
  await assert.rejects(fs.access(briefPath(root, 4)), { code: 'ENOENT' });
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
  assert.doesNotMatch(good.stdout, /^### Task \d+:/m);
  assert.ok(good.stdout.includes(`\nBrief: ${briefPath(root, 1)}\n`), good.stdout);
  const missing = await run(SCRIPT, ['--plan', path.join(root, 'nope.md')], { cwd: root });
  assert.equal(missing.code, 2);
  assert.equal(missing.stdout, '');
  assert.match(missing.stderr, /no plan at/);
});

test('a plan whose open tasks cannot be ordered stops with exit 1 and names the tasks, never "every task landed"', async () => {
  const bare = (number, dependsOn) => taskSection({ number, title: `T${number}`, dependsOn, files: [`- Create: \`a${number}.js\``], subject: `feat: t${number}` });
  const plans = {
    'Task 2 -> Task 3 -> Task 2': [bare(1, 'none'), bare(2, 'Task 3'), bare(3, 'Task 2')],
    'Task 2 depends on Task 9': [bare(1, 'none'), bare(2, 'Task 9')],
    'two tasks are numbered 1': [bare(1, 'none'), bare(1, 'none'), bare(2, 'Task 1')],
    "'### Task 2 - T2'": [bare(1, 'none'), bare(2, 'none').replace('### Task 2: T2', '### Task 2 - T2'), bare(3, 'none')]
  };
  for (const [reason, tasks] of Object.entries(plans)) {
    const root = await gitRepository({ 'docs/plans/fixture.md': planFixture({ tasks }) });
    land(root, 1, 'feat: t1');
    const result = await run(SCRIPT, ['--plan', path.join(root, 'docs/plans/fixture.md'), '--root', root], { cwd: root });
    assert.equal(result.code, 1, reason);
    assert.equal(result.stdout, '', reason);
    assert.ok(result.stderr.startsWith('next-task: ') && result.stderr.includes(reason), result.stderr);
  }
});

// The hook delegate-budget.mjs reads from the dispatch: a standalone
// `Budget: <soft>k/<hard>k` line, `soft`/`hard` in thousands of tokens.
const BUDGET_LINE = /^Budget: (\d+)k\/(\d+)k(?:\/(\d+) calls)?\s*$/m;

test('the report prints one Budget: line per task of the wave, scaled below the shared default', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  const matches = [...report.matchAll(new RegExp(BUDGET_LINE, 'gm'))];
  assert.equal(matches.length, 2, report);
  for (const match of matches) {
    assert.ok(Number(match[1]) < 40 && Number(match[2]) < 70, report);
  }
});

test('a task at or past the plan-check split threshold gets the shared default, never more', async () => {
  const bigCode = Array.from({ length: 260 }, (_, index) => `const line${index} = ${index};`).join('\n');
  const big = taskSection({ number: 1, title: 'Big', files: ['- Create: `src/big.js`'], code: bigCode, subject: 'feat(app): big' });
  const root = await gitRepository({ 'docs/plans/fixture.md': planFixture({ tasks: [big] }) });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextTaskReport({ planPath, planText: await fs.readFile(planPath, 'utf8'), root });
  assert.match(report, /^Budget: 40k\/70k$/m);
});

test('a Budget: line stands alone and matches the delegate-budget hook\'s regex', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  const match = report.match(BUDGET_LINE);
  assert.ok(match, report);
  assert.equal(match[0], 'Budget: 25k/44k');
});

test('a one-file task of a few lines still gets a hard limit of at least 35k, half the shared default as a floor', async () => {
  const small = taskSection({ number: 1, title: 'Small', files: ['- Create: `src/small.js`'], code: 'const a = 1;', subject: 'feat(app): small' });
  const root = await gitRepository({ 'docs/plans/fixture.md': planFixture({ tasks: [small] }) });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextTaskReport({ planPath, planText: await fs.readFile(planPath, 'utf8'), root });
  const match = report.match(BUDGET_LINE);
  assert.ok(match, report);
  assert.ok(Number(match[2]) >= 35, report);
});
