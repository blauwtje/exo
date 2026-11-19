import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';

const example = fs.readFileSync('skills/spec/references/example-plan.md', 'utf8');

test('a Consumes list naming a second task is checked against Depends on', () => {
  const plan = example.replace(
    'Depends on: 1, 2 | Files: `src/tasks/task-row.jsx`',
    'Depends on: 1 | Files: `src/tasks/task-row.jsx`'
  ).replace('as one badge | Proof', 'as one badge | Consumes: Task 1: task.dueDate, Task 2: dueTone | Proof');
  const report = planCheckReport(plan);
  assert.equal(report.ok, false, 'plan passes although Task 2 is not on a Depends on path');
  assert.match(report.lines.join('\n'), /Task 3 consumes Task 2 but Task 3 does not depend on Task 2/);
});
