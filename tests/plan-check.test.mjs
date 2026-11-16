import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';

const example = fs.readFileSync('skills/spec/references/example-plan.md', 'utf8');

test('the example plan passes the plan check', () => {
  const report = planCheckReport(example);
  assert.equal(report.ok, true, report.lines.join('\n'));
});

test('a task without Proof and an open point are named', () => {
  const broken = example.replace(' | Proof: npm test -- task.test', '').replace('## Tasks', '## Open points\n- which locale?\n\n## Tasks');
  const report = planCheckReport(broken);
  assert.equal(report.ok, false);
  assert.match(report.lines.join('\n'), /Task 1 lacks 'Proof:'/);
  assert.match(report.lines.join('\n'), /Open points/);
});

function problemsOf(planText) {
  const report = planCheckReport(planText);
  assert.equal(report.ok, false, report.lines.join('\n'));
  return report.lines.join('\n');
}

test('a task needs Data, and a bare none needs its reason', () => {
  assert.match(problemsOf(example.replace(' | Data: `task.dueDate: string` (ISO-8601), read by Task 3', '')), /Task 1 lacks 'Data:'/);
  assert.match(problemsOf(example.replace('Data: `task.dueDate: string` (ISO-8601), read by Task 3', 'Data: none')), /Task 1 lacks 'Data:'/);
  const deleted = example.replace('Data: `task.dueDate: string` (ISO-8601), read by Task 3', 'Data: none (deletes dead code)');
  assert.equal(planCheckReport(deleted).ok, true);
});

test('two tasks listing one file need a Depends on path', () => {
  const shared = example.replace('`src/tasks/due-tone.js`,', '`src/tasks/due-tone.js`, `src/tasks/task.js`,');
  assert.match(problemsOf(shared), /Task 1 and Task 2 both list 'src\/tasks\/task.js'/);
});

test('an Acceptance item that cites nothing is named', () => {
  const vague = example.replace('- Task 3 renders one badge per task row.', '- Badges look right.');
  assert.match(problemsOf(vague), /Acceptance item 'Badges look right.'/);
  const cited = example.replace('- Task 3 renders one badge per task row.', '- `task.dueDate` holds an ISO-8601 string.');
  assert.equal(planCheckReport(cited).ok, true);
});

test('a Files path in a folder that does not exist warns once', () => {
  const report = planCheckReport(example.replace('Repository: /repo', `Repository: ${process.cwd()}`));
  assert.equal(report.ok, true, report.lines.join('\n'));
  assert.equal(report.lines.filter((line) => /folder of 'src\/tasks\/task.js' does not exist/.test(line)).length, 1);
  assert.equal(report.lines.filter((line) => /does not exist/.test(line)).length, 1);
});

test('a Data reader that does not depend on the task is named', () => {
  const unlinked = example.replace('Depends on: 1, 2 |', 'Depends on: 2 |');
  assert.match(problemsOf(unlinked), /Task 1 says 'read by Task 3' but Task 3 does not depend on Task 1/);
});

test('a Files path that git ignores is a problem', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-check-ignored-'));
  execFileSync('git', ['-C', repo, 'init', '-q']);
  fs.writeFileSync(path.join(repo, '.gitignore'), 'src/tasks/\n');
  const report = planCheckReport(example.replace('Repository: /repo', `Repository: ${repo}`));
  assert.equal(report.ok, false);
  assert.match(report.lines.join('\n'), /Task 1: 'src\/tasks\/task.js' is ignored by git, so the task cannot land/);
});
