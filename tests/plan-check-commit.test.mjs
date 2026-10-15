import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;

function planWith(landLine, commitLine) {
  const task = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' });
  const extra = commitLine === null ? '' : `\n${commitLine}`;
  return compactPlanFixture({ tasks: [task] }).replace(/^(Branch: .+)$/m, `$1\n${landLine}${extra}`);
}

function commitProblems(report) {
  return report.lines.filter((line) => line.includes("'Commit:"));
}

test('plan-check passes Land: local with a Commit: line', () => {
  const report = planCheckReport(planWith('Land: local', 'Commit: feat(app): greet'));
  assert.equal(report.ok, true, report.lines.join('; '));
});

test('plan-check flags Land: local without a Commit: line', () => {
  const report = planCheckReport(planWith('Land: local', null));
  assert.equal(report.ok, false);
  assert.equal(commitProblems(report).length, 1, report.lines.join('; '));
});

test('plan-check flags Land: push-main without a Commit: line', () => {
  const report = planCheckReport(planWith('Land: push-main', null));
  assert.equal(commitProblems(report).length, 1, report.lines.join('; '));
});

test('plan-check flags a Commit: line that is not a Conventional Commit', () => {
  const report = planCheckReport(planWith('Land: local', 'Commit: add the greeting'));
  assert.equal(report.ok, false);
  assert.equal(commitProblems(report).length, 1, report.lines.join('; '));
});

test('plan-check needs no Commit: line for Land: pr', () => {
  const report = planCheckReport(planWith('Land: pr', null));
  assert.equal(commitProblems(report).length, 0, report.lines.join('; '));
});
