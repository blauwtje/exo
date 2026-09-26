// plan-check.mjs checks a plan against plan-spec.md per task, so planning
// repairs each problem line instead of reading the whole plan back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/draft-plan/scripts/plan-check.mjs';
import { briefFixture, compactPlanFixture, compactTask, planFixture, taskSection } from './harness.mjs';

const GOOD_CODE = 'export function greet() {\n  return "hello";\n}';

function goodTask({ number = 1, title = 'Greet', files = ['- Modify: `src/app.js` (`greet`)'], code = GOOD_CODE } = {}) {
  return [
    `### Task ${number}: ${title}`,
    '',
    'Depends on: none',
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

test('plan-check prints ok for a plan whose task satisfies every rule', () => {
  const plan = planFixture({ tasks: [goodTask()] });
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

function compactTasks(count) {
  return Array.from({ length: count }, (_, index) => compactTask({
    number: index + 1,
    title: `feat(app): t${index + 1}`,
    files: [`src/f${index + 1}.js`]
  }));
}

test('plan-check counts non-blank lines for the 30-line compact cap, ignoring blank separators between tasks', () => {
  const tasks = compactTasks(8);
  const withBlankSeparators = tasks.flatMap((task, index) => (index === 0 ? [task] : ['', task]));
  const ok = planCheckReport(compactPlanFixture({ tasks: withBlankSeparators }));
  assert.equal(ok.ok, true);
});

test('plan-check fails a compact plan past 30 non-blank lines even with no blank lines to spare', () => {
  const overCap = planCheckReport(compactPlanFixture({ tasks: compactTasks(8) })
    .replace('The fixture proves the compact plan reader.', 'The fixture proves the compact plan reader.\nA second sentence pushes it one line over.'));
  assert.equal(overCap.ok, false);
  assert.ok(overCap.lines.some((line) => line.includes('31 non-blank lines, past the 30-line compact cap')));
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

test('plan-check prints ok for a brief whose Decisions, Assumptions and Acceptance sit ahead of a compact task list', () => {
  const report = planCheckReport(briefFixture({ tasks: compactTasks(8) }));
  assert.equal(report.ok, true);
  assert.match(report.lines[0], /^plan-check: ok, 8 tasks/);
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
