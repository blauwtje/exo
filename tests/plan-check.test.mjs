// plan-check.mjs checks a plan against task-list.md per task, so planning
// repairs each problem line instead of reading the whole plan back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePlan } from '#plan-tasks';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { briefFixture, compactPlanFixture, compactTask, gitRepository, planFixture, taskSection } from './harness.mjs';

const GOOD_CODE = 'export function greet() {\n  return "hello";\n}';

function goodTask({ number = 1, title = 'Greet', dependsOn = 'none', files = ['- Modify: `src/app.js` (`greet`)'], code = GOOD_CODE } = {}) {
  return [
    `### Task ${number}: ${title}`,
    '',
    `Depends on: ${dependsOn}`,
    '',
    'Files:',
    ...files,
    '',
    'Step 1: Write it',
    '```js',
    code,
    '```',
    'Run: `node --test`',
    'Expected: `pass`',
    '',
    'Commit:',
    '```bash',
    `git add ${files.map((line) => line.match(/`([^`]+)`/)[1]).join(' ')}`,
    `git commit -m "feat(app): ${title.toLowerCase()}" -m "Plan-task: ${number}"`,
    '```',
    ''
  ].join('\n');
}

test('plan-check prints ok for a plan whose task satisfies every rule', async () => {
  const root = await gitRepository({ 'src/app.js': GOOD_CODE });
  const plan = planFixture({ tasks: [goodTask()] }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const report = planCheckReport(plan);
  assert.equal(report.ok, true);
  assert.deepEqual(report.lines, ['plan-check: ok, 1 tasks, largest Task 1 (3 lines)']);
});

test('plan-check reports a Commit: block with no Plan-task: trailer', () => {
  const section = goodTask().replace(' -m "Plan-task: 1"', '');
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('Task 1') && line.includes('Plan-task')));
});

test('plan-check reports a git add line that does not match Files:', () => {
  const section = goodTask().replace('git add src/app.js', 'git add .');
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('Task 1') && line.includes('git add')));
});

test('plan-check reports a step with code and no Run: or Expected:', () => {
  const section = goodTask().replace('Run: `node --test`\nExpected: `pass`\n', '');
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('Task 1') && line.includes('Run:')));
  assert.ok(report.lines.some((line) => line.includes('Task 1') && line.includes('Expected:')));
});

test('plan-check reports a TODO, an ellipsis and a "similar to Task" placeholder', () => {
  const section = goodTask({ code: '// TODO: fill this in\n...\nsimilar to Task 4' });
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('TODO')));
  assert.ok(report.lines.some((line) => line.includes("'...'")));
  assert.ok(report.lines.some((line) => line.includes('similar to Task')));
});

test('plan-check reports a task above 250 code lines as one to split', () => {
  const bigCode = Array.from({ length: 260 }, (_, index) => `const line${index} = ${index};`).join('\n');
  const section = goodTask({ code: bigCode });
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('split Task 1')));
});

test('plan-check reports a task above 4 files as one to split', () => {
  const files = ['a', 'b', 'c', 'd', 'e'].map((name) => `- Create: \`src/${name}.js\``);
  const section = goodTask({ files });
  const report = planCheckReport(planFixture({ tasks: [section] }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes('split Task 1')));
});

test('plan-check flags two Parallel: tasks that list the same Files: path', () => {
  const tasks = [goodTask({ number: 1 }), goodTask({ number: 2 })];
  const report = planCheckReport(planFixture({ worktreeSetup: 'none', parallel: 'Tasks 1 and 2.', tasks }));
  assert.ok(report.lines.includes('Task 1 and Task 2 are both on the Parallel: line but both list Files: `src/app.js`'));
});

test('plan-check passes Parallel: tasks whose Files: sets are disjoint', () => {
  const tasks = [goodTask({ number: 1 }), goodTask({ number: 2, files: ['- Modify: `src/other.js` (`greet`)'] })];
  const report = planCheckReport(planFixture({ worktreeSetup: 'none', parallel: 'Tasks 1 and 2.', tasks }));
  assert.ok(!report.lines.some((line) => line.includes('Parallel: line')));
});

function compactTasks(count) {
  return Array.from({ length: count }, (_, index) => compactTask({
    number: index + 1,
    title: `feat(app): t${index + 1}`,
    dependsOn: index === 0 ? 'none' : `${index}`,
    files: [`src/f${index + 1}.js`],
    proof: 'node --test tests/app.test.mjs'
  }));
}

const ACCEPTANCE_BULLET = '- An overdue task shows a badge in the warning tone.';
const ACCEPTANCE_BULLET_WITH_CITATION = `${ACCEPTANCE_BULLET} (Task 1)`;

test('plan-check prints ok for a 61-line brief with tasks, past the old 30-line compact cap', () => {
  const brief = briefFixture({ tasks: compactTasks(17) }).replace(ACCEPTANCE_BULLET, ACCEPTANCE_BULLET_WITH_CITATION);
  assert.equal(brief.split('\n').length, 61);
  const report = planCheckReport(brief);
  assert.equal(report.ok, true);
  assert.match(report.lines[0], /^plan-check: ok/);
});

test('plan-check fails a compact task whose field line lacks Files:', () => {
  const plan = compactPlanFixture({ tasks: ['### Task 1: feat(app): greet', 'Depends on: none | Data: a plain object'] });
  const report = planCheckReport(plan);
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("Task 1: field line lacks 'Files:'")));
});

test('plan-check fails a compact task whose field line lacks Proof:', () => {
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: null })] });
  const report = planCheckReport(plan);
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("Task 1: field line lacks 'Proof:'")));
});

test('plan-check fails a compact task whose Proof: runs the whole suite and accepts one test file', () => {
  const proofReport = (proof) => planCheckReport(compactPlanFixture({
    tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof })]
  }));
  for (const proof of ['npm test', 'npm run test > log', 'node --version && npm test']) {
    const report = proofReport(proof);
    assert.equal(report.ok, false, proof);
    assert.ok(report.lines.some((line) => line.includes("Task 1: 'Proof: ") && line.includes('runs the whole suite')), proof);
  }
  for (const proof of ['node --test tests/app.test.mjs', 'npm test -- tests/app.test.mjs']) {
    assert.equal(proofReport(proof).ok, true, proof);
  }
});

test('plan-check accepts a Risk: category on a compact task and fails any other value', () => {
  const task = (risk) => [
    '### Task 1: feat(app): greet',
    `Depends on: none | Files: \`src/app.js\` | Data: a plain object | Risk: ${risk} | Proof: node --test tests/app.test.mjs`
  ];
  const accepted = planCheckReport(compactPlanFixture({ tasks: task('persisted format') }));
  assert.equal(accepted.ok, true);
  const rejected = planCheckReport(compactPlanFixture({ tasks: task('big change') }));
  assert.equal(rejected.ok, false);
  assert.ok(rejected.lines.some((line) => line.includes("Task 1: 'Risk: big change' is not one of")));
});

test('plan-check prints ok for a brief whose Decisions and Acceptance sit ahead of a compact task list', () => {
  const report = planCheckReport(briefFixture({ tasks: compactTasks(8) }).replace(ACCEPTANCE_BULLET, ACCEPTANCE_BULLET_WITH_CITATION));
  assert.equal(report.ok, true);
  assert.match(report.lines[0], /^plan-check: ok, 8 tasks/);
});

test('plan-check passes a brief with a Manual checks list, and parsePlan reads no task from it', () => {
  const manualChecks = [
    '- Click Export in the app and open the file in a spreadsheet.',
    '- Sign in to the payment dashboard and confirm the test charge shows.'
  ];
  const brief = briefFixture({ tasks: compactTasks(2) })
    .replace(ACCEPTANCE_BULLET, ACCEPTANCE_BULLET_WITH_CITATION)
    .replace('## Plan basis', ['## Manual checks', ...manualChecks, '', '## Plan basis'].join('\n'));
  const report = planCheckReport(brief);
  assert.equal(report.ok, true);
  assert.match(report.lines[0], /^plan-check: ok, 2 tasks/);

  const plan = parsePlan(brief);
  assert.deepEqual(plan.tasks.map((task) => task.number), [1, 2]);
  assert.ok(plan.tasks.every((task) => !task.section.includes('Click Export') && !task.section.includes('payment dashboard')));
  assert.equal(plan.frame['Manual checks'], manualChecks.join('\n'));
});

test('plan-check prints ok when a Modify: path exists in the repository named by root', async () => {
  const root = await gitRepository({ 'src/app.js': GOOD_CODE });
  const report = planCheckReport(planFixture({ tasks: [goodTask()] }), { root });
  assert.equal(report.ok, true);
});

test('plan-check reports a Modify: path missing from the repository named by root', async () => {
  const root = await gitRepository({ 'README.md': 'placeholder\n' });
  const report = planCheckReport(planFixture({ tasks: [goodTask()] }), { root });
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) =>
    line.includes('Task 1') && line.includes('src/app.js') && line.includes('does not exist')));
});

test('plan-check skips the Modify: check with no root given and no Repository: line', () => {
  const plan = planFixture({ tasks: [goodTask()] }).replace('Repository: /tmp/fixture\n', '');
  const report = planCheckReport(plan);
  assert.equal(report.ok, true);
});

test('plan-check with no --root falls back to the plan\'s own Repository: line', async () => {
  const root = await gitRepository({ 'src/app.js': GOOD_CODE });
  const plan = planFixture({ tasks: [goodTask()] }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const report = planCheckReport(plan);
  assert.equal(report.ok, true);
});

test('plan-check reports two tasks sharing a Files: path with no Depends on chain', async () => {
  const root = await gitRepository({ 'src/shared.js': GOOD_CODE });
  const first = goodTask({ number: 1, title: 'Add', files: ['- Modify: `src/shared.js`'] });
  const second = goodTask({ number: 2, title: 'Change', files: ['- Modify: `src/shared.js`'] });
  const report = planCheckReport(planFixture({ tasks: [first, second] }), { root });
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) =>
    line.includes('Task 1') && line.includes('Task 2') && line.includes('src/shared.js') && line.includes('Depends on chain')));
});

test('plan-check prints ok for two tasks sharing a Files: path through a Depends on chain', async () => {
  const root = await gitRepository({ 'src/shared.js': GOOD_CODE });
  const first = goodTask({ number: 1, title: 'Add', files: ['- Modify: `src/shared.js`'] });
  const second = goodTask({ number: 2, title: 'Change', dependsOn: '1', files: ['- Modify: `src/shared.js`'] });
  const report = planCheckReport(planFixture({ tasks: [first, second] }), { root });
  assert.equal(report.ok, true);
});

test('plan-check does not flag a Modify: path an earlier task in its Depends on chain lists as Create:', async () => {
  const root = await gitRepository({ 'README.md': 'placeholder\n' });
  const first = goodTask({ number: 1, title: 'Add', files: ['- Create: `src/a.ts`'] });
  const second = goodTask({ number: 2, title: 'Change', dependsOn: '1', files: ['- Modify: `src/a.ts`'] });
  const report = planCheckReport(planFixture({ tasks: [first, second] }), { root });
  assert.equal(report.ok, true);
});

test('plan-check fails a compact plan whose Plan basis lacks a Repository: or a Branch: line', () => {
  const missingRepository = planCheckReport(compactPlanFixture({ tasks: compactTasks(1) })
    .replace('Repository: /tmp/fixture\n', ''));
  assert.equal(missingRepository.ok, false);
  assert.ok(missingRepository.lines.some((line) => line.includes("no 'Repository:' line")));

  const missingBranch = planCheckReport(compactPlanFixture({ tasks: compactTasks(1) })
    .replace('Branch: feat/fixture\n', ''));
  assert.equal(missingBranch.ok, false);
  assert.ok(missingBranch.lines.some((line) => line.includes("no 'Branch:' line")));
});

test('plan-check fails a compact plan missing Goal, Success criterion or a Checkpoint point', () => {
  const missingGoal = planCheckReport(['# Plan', '', '## Success criterion', 'ok', '', '## Checkpoint',
    '- Blocks first: none.', '- Parallel: all.', '- Shared state: none.', '- Smallest safe split: one.',
    '', '## Tasks', '', ...compactTasks(1), ''].join('\n'));
  assert.ok(missingGoal.lines.some((line) => line.includes("no '## Goal'")));

  const missingCriterion = planCheckReport(compactPlanFixture({ tasks: compactTasks(1) })
    .replace(/## Success criterion\n`node --test` passes\.\n\n/, ''));
  assert.ok(missingCriterion.lines.some((line) => line.includes("no '## Success criterion'")));

  const missingPoint = planCheckReport(compactPlanFixture({ tasks: compactTasks(1) })
    .replace('- Shared state: none.\n', ''));
  assert.ok(missingPoint.lines.some((line) => line.includes("no 'Shared state:' point")));
});

test('plan-check fails a compact plan whose package.json has a typecheck script and no Land gate: line', async () => {
  const root = await gitRepository({ 'package.json': JSON.stringify({ scripts: { typecheck: 'echo ok' } }) });
  const plan = compactPlanFixture({ tasks: compactTasks(1) }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const report = planCheckReport(plan);
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("no 'Land gate:' line") && line.includes('Land gate: npm run typecheck')));
});

test('plan-check fails a compact plan whose package.json has a lint script and no Lint: line', async () => {
  const root = await gitRepository({ 'package.json': JSON.stringify({ scripts: { lint: 'echo ok' } }) });
  const plan = compactPlanFixture({ tasks: compactTasks(1) }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const report = planCheckReport(plan);
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("no 'Lint:' line") && line.includes('Lint: npx eslint')));
});

test('plan-check prints ok for a compact plan whose package.json has a test script but no typecheck or lint script', async () => {
  const root = await gitRepository({ 'package.json': JSON.stringify({ scripts: { test: 'echo ok', validate: 'echo ok', check: 'echo ok' } }) });
  const plan = compactPlanFixture({ tasks: compactTasks(1) }).replace('Repository: /tmp/fixture', `Repository: ${root}`);
  const report = planCheckReport(plan);
  assert.equal(report.ok, true);
});

test('plan-check accepts Land gate: none and Lint: none as deliberate opt-outs', async () => {
  const root = await gitRepository({ 'package.json': JSON.stringify({ scripts: { typecheck: 'echo ok', lint: 'echo ok' } }) });
  const plan = compactPlanFixture({ tasks: compactTasks(1) })
    .replace('Repository: /tmp/fixture', `Repository: ${root}`)
    .replace('Branch: feat/fixture', 'Branch: feat/fixture\nLand gate: none\nLint: none');
  const report = planCheckReport(plan);
  assert.equal(report.ok, true);
});

test('plan-check passes an Acceptance bullet that cites a task number', () => {
  const brief = briefFixture({ tasks: compactTasks(1) })
    .replace(ACCEPTANCE_BULLET, ACCEPTANCE_BULLET_WITH_CITATION);
  const report = planCheckReport(brief);
  assert.equal(report.ok, true);
});

test('plan-check fails an Acceptance bullet that names no task number, Data:, Success criterion or Manual checks line', () => {
  const report = planCheckReport(briefFixture({ tasks: compactTasks(1) }));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("the plan's '## Acceptance' item") && line.includes(ACCEPTANCE_BULLET.slice(2))));
});

test('plan-check flags independent tasks in a plan with no Worktree setup: line', () => {
  const first = goodTask({ number: 1, title: 'Add', files: ['- Create: `src/a.js`'] });
  const second = goodTask({ number: 2, title: 'Change', files: ['- Create: `src/b.js`'] });
  const report = planCheckReport(planFixture({ tasks: [first, second] }));
  assert.equal(report.ok, false);
  assert.deepEqual(report.lines.filter((line) => line.includes('Worktree setup:')).length, 1);
  assert.ok(report.lines.some((line) => line.includes('Task 1 and Task 2') && line.includes('Worktree setup:')));
});

test('plan-check accepts independent tasks once the plan names Worktree setup: none or a command', () => {
  const first = goodTask({ number: 1, title: 'Add', files: ['- Create: `src/a.js`'] });
  const second = goodTask({ number: 2, title: 'Change', files: ['- Create: `src/b.js`'] });
  for (const worktreeSetup of ['none', 'npm ci']) {
    const report = planCheckReport(planFixture({ worktreeSetup, tasks: [first, second] }));
    assert.equal(report.ok, true);
  }
});

test('plan-check does not flag a plan whose tasks form one Depends on chain, with no Worktree setup: line', () => {
  const report = planCheckReport(compactPlanFixture({ tasks: compactTasks(3) }));
  assert.equal(report.ok, true);
});

const LOOP_TASK = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' });
const loopPlan = (tasks = [LOOP_TASK]) => compactPlanFixture({ tasks }).replace('Branch: feat/fixture', 'Branch: feat/fixture\nAllow: none');
const loopProblems = (plan, root, planPath) => planCheckReport(plan, { loop: true, root, planPath }).lines.filter((line) => line.startsWith('loop: '));

test('plan-check --loop passes a plan with one command criterion and a Bash Proof:, with or without Allow:', () => {
  assert.equal(planCheckReport(loopPlan(), { loop: true }).ok, true);
  assert.equal(planCheckReport(compactPlanFixture({ tasks: [LOOP_TASK] }), { loop: true }).ok, true);
  assert.equal(planCheckReport(loopPlan().replace('Allow: none', 'Allow: `npx eslint`, `git status`'), { loop: true }).ok, true);
});

test('plan-check without --loop ignores every loop field', () => {
  const plan = compactPlanFixture({ tasks: [LOOP_TASK] });
  const redirecting = plan.replace('`node --test` passes.', '`node --test > out.log` passes.');
  assert.equal(planCheckReport(redirecting).ok, true);
  assert.equal(planCheckReport(redirecting, { loop: true }).ok, false);
});

test('plan-check --loop no longer asks for an Allow: line', () => {
  assert.deepEqual(loopProblems(compactPlanFixture({ tasks: [LOOP_TASK] })), []);
});

test('plan-check --loop refuses a Success criterion that is not one backticked non-MCP command', () => {
  for (const criterion of ['Everything passes.', '`node --test` and `npm run lint` pass.', '`mcp:run_playtest` passes.', '`run_playtest` passes.']) {
    const problems = loopProblems(loopPlan().replace('`node --test` passes.', criterion));
    assert.equal(problems.length, 1, criterion);
    assert.match(problems[0], /Success criterion/, criterion);
  }
});

test('plan-check --loop refuses an MCP Proof: and names the task', () => {
  const task = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'mcp:run_playtest {}' });
  const problems = loopProblems(loopPlan([task]));
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Task 1: 'Proof: mcp:run_playtest \{\}' is an MCP call/);
});

test('plan-check --loop refuses a passing MCP Run: and accepts a Bash one', () => {
  const planWith = (command) => loopPlan([goodTask({ number: 1 })]).replace('## Tasks', '## Success criterion\n`node --test` passes.\n\n## Tasks').replace('Run: `node --test`', `Run: \`${command}\``);
  const refused = loopProblems(planWith('mcp:check_map {}'));
  assert.ok(refused.some((line) => /Task 1: 'Run: mcp:check_map \{\}' is an MCP call/.test(line)), refused.join('\n'));
  assert.ok(!loopProblems(planWith('node --test')).some((line) => line.includes('MCP')));
});

test('plan-check --loop refuses a command part that redirects output to a file, but not 2>&1 or /dev/null', () => {
  const planWith = (proof) => loopPlan([compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof })]);
  for (const proof of ['node --test > out.log', 'node a.mjs && node b.mjs >> out.log', 'node --test 2> err.txt']) {
    const problems = loopProblems(planWith(proof));
    assert.equal(problems.length, 1, proof);
    assert.match(problems[0], /Task 1: .* redirects output to a file/, proof);
  }
  for (const proof of ['node --test 2>&1', 'node --test > /dev/null', 'node -e "a=>b"']) {
    assert.deepEqual(loopProblems(planWith(proof)), [], proof);
  }
  assert.match(loopProblems(loopPlan().replace('`node --test` passes.', '`npm run build > out.txt` passes.'))[0], /Success criterion: .* redirects output to a file/);
});

test('plan-check --loop refuses a Design: task unless Visual direction names a contract-selected.json', () => {
  const task = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], design: 'design-ui', proof: 'node --test tests/app.test.mjs' });
  const visual = (text) => loopPlan([task]).replace('## Tasks', `## Visual direction\n${text}\n\n## Tasks`);
  const refused = loopProblems(visual('Quiet record.'));
  assert.equal(refused.length, 1);
  assert.match(refused[0], /Task 1: .*Design:.*contract-selected\.json/);
  assert.deepEqual(loopProblems(visual('Contract: docs/contract-selected.json')), []);
  assert.deepEqual(loopProblems(loopPlan()), []);
});

test('plan-check --loop refuses a Branch: that names the default branch', async () => {
  const root = await gitRepository({ 'src/app.js': GOOD_CODE });
  const onMain = loopPlan().replace('Branch: feat/fixture', 'Branch: main');
  const problems = loopProblems(onMain, root);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /Branch: main.*default branch/);
  assert.deepEqual(loopProblems(loopPlan(), root), []);
});

test('plan-check --loop refuses a task that lists the plan file in Files:', async () => {
  const planTask = compactTask({ number: 1, title: 'docs(plan): tick', files: ['./docs/plans/p.md'], proof: 'node --test tests/app.test.mjs' });
  const plan = loopPlan([planTask]);
  const root = await gitRepository({ 'src/app.js': GOOD_CODE, 'docs/plans/p.md': plan });
  assert.deepEqual(loopProblems(plan, root, `${root}/docs/plans/p.md`), [
    "loop: Task 1: lists the plan file in Files:, which stops run-plan with 'plan changed'; move that edit to a session after the run"
  ]);
  assert.deepEqual(loopProblems(loopPlan(), root, `${root}/docs/plans/p.md`), []);
});

test('plan-check --loop refuses Land gate: none or a missing one while package.json has a check or test script', async () => {
  const withGate = (gate) => loopPlan().replace('Allow: none', `Allow: none\nLand gate: ${gate}`);
  const checkRoot = await gitRepository({ 'src/app.js': GOOD_CODE, 'package.json': JSON.stringify({ scripts: { check: 'echo ok', test: 'echo ok' } }) });
  const refused = loopProblems(withGate('none'), checkRoot);
  assert.equal(refused.length, 1);
  assert.match(refused[0], /'Land gate: none' skips the full check; set 'Land gate: npm run check'/);
  assert.match(loopProblems(loopPlan(), checkRoot)[0], /set 'Land gate: npm run check'/);
  assert.deepEqual(loopProblems(withGate('npm run check'), checkRoot), []);
  const testRoot = await gitRepository({ 'src/app.js': GOOD_CODE, 'package.json': JSON.stringify({ scripts: { test: 'echo ok' } }) });
  assert.match(loopProblems(withGate('none'), testRoot)[0], /set 'Land gate: npm test'/);
  const bareRoot = await gitRepository({ 'src/app.js': GOOD_CODE, 'package.json': JSON.stringify({ scripts: { build: 'echo ok' } }) });
  assert.deepEqual(loopProblems(withGate('none'), bareRoot), []);
});
