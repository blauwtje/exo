// next-task.mjs prints the landed set, the next task or wave, and for each of
// its tasks the drift of its Modify: regions and the path of the brief it
// writes with the frame fields and the section, read from the plan and the
// checkout rather than the session's memory.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { blockReport, frameOnlyReport, nextTaskReport } from '../skills/build/scripts/next-task.mjs';
import { BLOCK_TASK_LIMIT } from '#plan-tasks';
import { proofsReport } from '#proofs-report';
import { briefFixture, compactTask, git, gitRepository, planFixture, run, taskSection } from './harness.mjs';

const SCRIPT = fileURLToPath(new URL('../skills/build/scripts/next-task.mjs', import.meta.url));

const PLAN = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: [
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
  return path.join(git(root, 'rev-parse', '--show-toplevel'), '.exo', 'briefs', `task-${number}.md`);
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

test('a stacked branch counts only the trailers that name this plan\'s file', async () => {
  const { root, planPath } = await checkout();
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: earlier-plan/1');
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): something else', '-m', 'Plan-task: 3');
  assert.match(nextTaskReport({ planPath, planText: PLAN, root }), /^Landed: none$/m);
  git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): greet', '-m', 'Plan-task: fixture/1');
  land(root, 3, 'feat(app): wave');
  assert.match(nextTaskReport({ planPath, planText: PLAN, root }), /^Landed: 1, 3$/m);
});

function plannedTasks(count) {
  return Array.from({ length: count }, (_, index) => taskSection({
    number: index + 1, title: `Part ${index + 1}`, files: [`- Create: \`src/part-${index + 1}.js\``], subject: `feat(app): part ${index + 1}`
  }));
}

test('the route follows the plan\'s task count against BLOCK_TASK_LIMIT, never the wave size', async () => {
  const { root, planPath } = await checkout();
  assert.match(nextTaskReport({ planPath, planText: PLAN, root }), /^Route: unit \(\d+ tasks\)$/m);
  const atLimit = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: plannedTasks(BLOCK_TASK_LIMIT) });
  assert.match(nextTaskReport({ planPath, planText: atLimit, root }), /^Route: unit \(\d+ tasks\)$/m);
  const aboveLimit = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: plannedTasks(BLOCK_TASK_LIMIT + 4) });
  const report = nextTaskReport({ planPath, planText: aboveLimit, root });
  assert.match(report, /^Route: unit \(12 tasks\)$/m);
  assert.match(report, /^Wave: Task 1, Task 2, Task 3, Task 4$/m, 'a wave still prints above the limit');
});

test('the wave admits only the tasks the Checkpoint Parallel: line names', async () => {
  const { root } = await checkout();
  const planPath = path.join(root, 'docs/plans/named.md');
  await fs.writeFile(planPath, planFixture({ worktreeSetup: 'none', parallel: '1, 3.', tasks: plannedTasks(4) }));
  const named = await run(SCRIPT, ['--plan', planPath, '--root', root], { cwd: root });
  assert.equal(named.code, 0, named.stderr);
  assert.match(named.stdout, /^Wave: Task 1, Task 3$/m);
});

test('a plan with no Parallel: line builds every task serially', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: planFixture({ worktreeSetup: 'none', tasks: plannedTasks(4) }), root });
  assert.match(report, /^Next: Task 1$/m);
  assert.doesNotMatch(report, /^Wave: /m);
});

test('a checkout under .claude/worktrees/ builds one task at a time, while the main checkout still forms the wave', async () => {
  const { root, planPath } = await checkout();
  const planText = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks: plannedTasks(2) });
  const isolated = path.join(root, '.claude', 'worktrees', 'feat+x');
  git(root, 'worktree', 'add', '-q', '-b', 'feat/x', isolated);
  const report = nextTaskReport({ planPath, planText, root: isolated });
  assert.match(report, /^Next: Task 1$/m);
  assert.doesNotMatch(report, /^Wave:/m);
  assert.match(nextTaskReport({ planPath, planText, root }), /^Wave: Task 1, Task 2$/m);
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
  assert.doesNotMatch(brief, /^Success criterion:/m);
});

test('a Success criterion section becomes a Success criterion: line after Goal:, joined across its lines', async () => {
  const planWithCriterion = PLAN.replace(
    '\n## Non-goals',
    '\n## Success criterion\n\n`node --test` passes.\nNo new files remain uncommitted.\n\n## Non-goals'
  );
  const root = await gitRepository({
    'src/app.js': 'export function greet() {\n  return "hi";\n}\n',
    'docs/plans/fixture.md': planWithCriterion
  });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  nextTaskReport({ planPath, planText: planWithCriterion, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^Goal: The fixture proves the plan reader\.\nSuccess criterion: `node --test` passes\.\nNo new files remain uncommitted\.$/m);
});

test('a task brief and the --frame report carry the plan\'s Decisions bullets, the task\'s own first', async () => {
  const planWithDecisions = PLAN.replace(
    '\n## Non-goals',
    '\n## Decisions\n\n- `src/app.js` keeps `greet` synchronous.\n- `src/wave.js` is generated.\n\n## Non-goals'
  );
  const root = await gitRepository({
    'src/app.js': 'export function greet() {\n  return "hi";\n}\n',
    'docs/plans/fixture.md': planWithDecisions
  });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  nextTaskReport({ planPath, planText: planWithDecisions, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^Decisions for these paths:\n- `src\/app\.js` keeps `greet` synchronous\.\n/m);
  assert.doesNotMatch(brief, /`src\/wave\.js` is generated/);
  const frameReport = frameOnlyReport(planWithDecisions);
  assert.match(frameReport, /^Decisions for these paths:\n- `src\/app\.js` keeps `greet` synchronous\.\n- `src\/wave\.js` is generated\.$/m);
});

function threeFilePlan() {
  return planFixture({ worktreeSetup: 'none', tasks: [
    taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)', '- Create: `src/b.js`', '- Create: `src/c.js`'], subject: 'feat(app): greet' })
  ] });
}

test('a three-file task with no Decisions section prints Decisions for these paths: - none', async () => {
  const { root, planPath } = await checkout();
  const planText = threeFilePlan();
  nextTaskReport({ planPath, planText, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^Decisions for these paths:\n- none$/m);
});

test('a three-file task with no bullet naming its paths keeps every bullet', async () => {
  const { root, planPath } = await checkout();
  const planText = threeFilePlan().replace('`src/app.js` exports `greet`.', '`src/zzz.js` exports `hello`.').replace('- `src/other.js` is untouched.', '- `src/yyy.js` is untouched.');
  nextTaskReport({ planPath, planText, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^- `src\/zzz\.js` exports `hello`\.$/m);
  assert.match(brief, /^- `src\/yyy\.js` is untouched\.$/m);
});

test('a task of at most two files keeps only the bullets naming its paths and leaves out an empty heading and an empty Modify ranges', async () => {
  const { root, planPath } = await checkout();
  nextTaskReport({ planPath, planText: PLAN, root });
  const brief = await fs.readFile(briefPath(root, 3), 'utf8');
  assert.doesNotMatch(brief, /^Non-goals touching these paths:/m);
  assert.doesNotMatch(brief, /^Context for these paths and symbols:/m);
  assert.doesNotMatch(brief, /^Decisions for these paths:/m);
  assert.doesNotMatch(brief, /^Modify ranges:/m);
  assert.doesNotMatch(brief, /src\/other\.js/);
  assert.match(brief, /^Goal: The fixture proves the plan reader\.$/m);
  assert.match(brief, /^The task section:$/m);
  const first = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.doesNotMatch(first, /src\/other\.js/);
  assert.match(first, /^Context for these paths and symbols:\n- `src\/app\.js` exports `greet`\.$/m);
});

test('a small task keeps a bullet naming its basename or a parent directory, not a sibling file or another directory\'s file', async () => {
  const { root, planPath } = await checkout();
  const planText = PLAN.replace('- `src/other.js` is untouched.', '- `src/other.js` is untouched.\n- `lib/app.js` is not it.\n- app.js stays synchronous.\n- Everything in `src/` is plain ESM.');
  nextTaskReport({ planPath, planText, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, /^- app\.js stays synchronous\.$/m);
  assert.match(brief, /^- Everything in `src\/` is plain ESM\.$/m);
  assert.doesNotMatch(brief, /lib\/app\.js/);
  assert.doesNotMatch(brief, /`src\/other\.js` is untouched/);
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
  assert.match(report, /^Design: design-ui$/m);
  assert.match(await fs.readFile(briefPath(root, 2), 'utf8'), /^Visual direction:\nDesign skill: design-ui$/m);
  await assert.rejects(fs.access(briefPath(root, 4)), { code: 'ENOENT' });
});

test('a brief with a compact task list prints Brief:, Proof: and the compact Design: segment, not "Design: none"', async () => {
  const compactPlan = briefFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(tasks): add a dueDate field', files: ['src/tasks/task.js'], design: 'design-ui', proof: 'node --test -- task.test' })
  ] });
  const root = await gitRepository({
    'src/tasks/task.js': 'export const task = {};\n',
    'docs/plans/fixture.md': compactPlan
  });
  const planPath = path.join(root, 'docs/plans/fixture.md');
  const report = nextTaskReport({ planPath, planText: compactPlan, root });
  assert.match(report, /^Design: design-ui$/m);
  assert.match(report, /^Proof: node --test -- task\.test$/m);
  const briefMatch = report.match(/^Brief: (.+)$/m);
  assert.ok(briefMatch, report);
  const brief = await fs.readFile(briefMatch[1], 'utf8');
  assert.match(brief, /^### Task 1: feat\(tasks\): add a dueDate field$/m);
  assert.match(brief, /Depends on: none \| Files: `src\/tasks\/task\.js` \| Data: a plain object \| Design: design-ui \| Proof: node --test -- task\.test$/m);
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

test('--frame prints the plan frame\'s header sections and no task or wave', async () => {
  const report = frameOnlyReport(PLAN);
  assert.match(report, /^Goal: The fixture proves the plan reader\.$/m);
  assert.match(report, /^Non-goals touching these paths:$/m);
  assert.match(report, /^Context for these paths and symbols:$/m);
  assert.match(report, /^Visual direction:\nDesign skill: design-ui$/m);
  assert.doesNotMatch(report, /^Wave:/m);
  assert.doesNotMatch(report, /^### Task \d+:/m);
});

test('the command line prints the frame report under --frame and writes no brief', async () => {
  const { root, planPath } = await checkout();
  const result = await run(SCRIPT, ['--plan', planPath, '--root', root, '--frame'], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Goal: The fixture proves the plan reader\.$/m);
  assert.doesNotMatch(result.stdout, /^Wave:/m);
  await assert.rejects(fs.access(briefPath(root, 1)), { code: 'ENOENT' });
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

test('the report prints no Budget: line, since each agent carries its own maxTurns', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.doesNotMatch(report, /^Budget:/m);
});

test('with every task landed, the report reads Next: none and never Next phase:', async () => {
  const { root, planPath } = await checkout();
  land(root, 1, 'feat(app): greet');
  land(root, 2, 'feat(app): style');
  land(root, 3, 'feat(app): wave');
  land(root, 4, 'feat(app): tail');
  const report = nextTaskReport({ planPath, planText: PLAN, root });
  assert.match(report, /^Next: none, every task landed$/m);
  assert.doesNotMatch(report, /^Next phase:/m);
});


test('--proofs prints each landed task\'s recorded Proof lines and the decision log path, so the session reads neither plan nor log', async () => {
  const { root, planPath } = await checkout();
  assert.equal(proofsReport({ planPath, planText: PLAN, root }), 'Landed: none\n');
  land(root, 1, 'feat(app): greet');
  land(root, 3, 'feat(app): wave');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/proof-fixture-task-1.txt'), 'Proof: `node --test` -> exit 0, ℹ pass 3\n');
  const decisions = path.join(root, 'docs/plans/fixture-decisions.md');
  await fs.writeFile(decisions, 'Task 1 abc1234: kept the default\n');
  assert.equal(proofsReport({ planPath, planText: PLAN, root }), [
    'Proof: `node --test` -> exit 0, ℹ pass 3',
    'No proof: Task 3 landed with no land-task record',
    `Decisions: ${decisions}`
  ].join('\n') + '\n');
  const result = await run(SCRIPT, ['--proofs', '--plan', planPath, '--root', root], { cwd: root });
  assert.match(result.stdout, /^Proof: `node --test` -> exit 0, ℹ pass 3$/m);
});

test('--block prints each landed task\'s recorded Proof lines after the block, so the report has them however verify ends', async () => {
  const { root, planPath } = await checkout();
  assert.doesNotMatch(blockReport({ planPath, planText: PLAN, root }), /^(Proof|No proof|Decisions):/m);
  land(root, 1, 'feat(app): greet');
  await fs.mkdir(path.join(root, '.exo'), { recursive: true });
  await fs.writeFile(path.join(root, '.exo/proof-fixture-task-1.txt'), 'Proof: `node --test` -> exit 0, ℹ pass 3\n');
  const decisions = path.join(root, 'docs/plans/fixture-decisions.md');
  await fs.writeFile(decisions, 'Task 1 abc1234: kept the default\n');
  const report = blockReport({ planPath, planText: PLAN, root });
  assert.ok(report.endsWith(`\nProof: \`node --test\` -> exit 0, ℹ pass 3\nDecisions: ${decisions}\n`), report);
  assert.match(report, /^Landed: 1$/m);
});

test('--block prints a Design: task with its direction, so the session never reads the Visual direction', async () => {
  const { root, planPath } = await checkout();
  land(root, 1, 'feat(app): greet');
  land(root, 3, 'feat(app): wave');
  const directions = [
    ['Quiet record.', 'none'],
    ['Contract: docs/design/direction.json', 'named'],
    ['Direction: pending at rung 3, the brief names the user as chooser.', 'pending at rung 3']
  ];
  for (const [section, direction] of directions) {
    const planText = PLAN.replace('Quiet record.', section);
    const report = blockReport({ planPath, planText, root });
    assert.match(report, new RegExp(`^Design: Task 2, direction ${direction}$`, 'm'));
    assert.doesNotMatch(report, /Quiet record|Contract:|Brief:/);
  }
  await assert.rejects(fs.access(briefPath(root, 2)), { code: 'ENOENT' });
});

async function inlineReport(report = nextTaskReport) {
  const { root, planPath } = await checkout();
  const tasks = [1, 2, 3].map((number) => taskSection({
    number, title: `Part ${number}`, files: [`- Create: \`src/part-${number}.js\``], code: `export const part${number} = ${number};`, subject: `feat(app): part ${number}`
  }));
  const inlinePlan = planFixture({ worktreeSetup: 'none', parallel: 'every task.', tasks });
  land(root, 1, 'feat(app): part 1');
  return { root, planPath, report: report({ planPath, planText: inlinePlan, root }) };
}

test('on the inline route the report prints every unlanded task\'s section, with no brief, budget or Wave: line', async () => {
  const { root, report } = await inlineReport();
  assert.match(report, /^Route: inline \(3 tasks, code pasted, files disjoint\)$/m);
  assert.match(report, /^Next: Task 2\nInline: Task 2, Task 3$/m);
  assert.doesNotMatch(report, /^Wave:/m);
  assert.match(report, /^### Task 2: Part 2$/m);
  assert.match(report, /^### Task 3: Part 3$/m);
  assert.match(report, /^export const part3 = 3;$/m);
  assert.doesNotMatch(report, /^### Task 1:/m);
  assert.doesNotMatch(report, /^(Brief|Budget):/m);
  await assert.rejects(fs.access(briefPath(root, 2)), { code: 'ENOENT' });
});

test('on the inline route --block prints the inline report, never a Block: line', async () => {
  const { report } = await inlineReport(blockReport);
  assert.match(report, /^Inline: Task 2, Task 3\nSteps:$/m);
  assert.doesNotMatch(report, /^Block:/m);
});

test('on the inline route the report prints the inline reference\'s steps with the skill, plan and checkout filled in', async () => {
  const { root, planPath, report } = await inlineReport();
  const skill = fileURLToPath(new URL('../skills/build', import.meta.url));
  const reference = await fs.readFile(path.join(skill, 'references/run-loop-inline.md'), 'utf8');
  const steps = reference.split('\n').filter((line) => line.startsWith('- '));
  assert.ok(steps.length > 0, reference);
  assert.match(report, /^Inline: Task 2, Task 3\nSteps:$/m);
  for (const step of steps) {
    const filled = step.replaceAll('${CLAUDE_SKILL_DIR}', skill).replaceAll('<plan>', planPath).replaceAll('<checkout>', root);
    assert.ok(report.includes(`\n${filled}\n`), `${filled}\n---\n${report}`);
  }
  assert.ok(report.includes(`node "${skill}/scripts/land-task.mjs" --plan ${planPath} --task <n> --root ${root}`), report);
  assert.doesNotMatch(report, /CLAUDE_SKILL_DIR/);
});

test('the brief states build-task\'s report cap', async () => {
  const { root, planPath } = await checkout();
  const prompt = await fs.readFile(fileURLToPath(new URL('../agents/build-task.md', import.meta.url)), 'utf8');
  const cap = Number(/\bat most (\d+) lines\b/.exec(prompt)[1]);
  nextTaskReport({ planPath, planText: PLAN, root });
  const brief = await fs.readFile(briefPath(root, 1), 'utf8');
  assert.match(brief, new RegExp(`^Report cap: ${cap} lines$`, 'm'), brief);
});

test('the brief names a Proof that calls an MCP tool as Deferred:, and a shell Proof gets no such line', async () => {
  const build = async (proof) => {
    const planText = briefFixture({ tasks: [compactTask({ number: 1, title: 'feat(tasks): add a dueDate field', files: ['src/tasks/task.js'], proof })] });
    const root = await gitRepository({ 'src/tasks/task.js': 'export const task = {};\n', 'docs/plans/fixture.md': planText });
    nextTaskReport({ planPath: path.join(root, 'docs/plans/fixture.md'), planText, root });
    return fs.readFile(briefPath(root, 1), 'utf8');
  };
  assert.match(await build('mcp:run_playtest zone-1'), /^Deferred: mcp:run_playtest zone-1$/m);
  assert.doesNotMatch(await build('node --test -- task.test'), /^Deferred:/m);
});

test('with --in-flight tasks the report prints a Start: line in place of Next: or Wave:', async () => {
  const { root, planPath } = await checkout();
  const report = nextTaskReport({ planPath, planText: PLAN, root, inFlight: [1] });
  assert.match(report, /^Start: Task 3$/m);
  assert.doesNotMatch(report, /^(Wave|Next):/m);
});
