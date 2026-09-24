// plan-check.mjs checks a plan against plan-spec.md per task, so planning
// repairs each problem line instead of reading the whole plan back.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/planning/scripts/plan-check.mjs';
import { planFixture, taskSection } from './harness.mjs';

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
