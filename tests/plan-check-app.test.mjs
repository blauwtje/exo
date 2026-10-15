import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;

function planWith(appLine) {
  const task = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' });
  const extra = appLine === null ? '' : `\n${appLine}`;
  return compactPlanFixture({ tasks: [task] }).replace(/^(Branch: .+)$/m, `$1\nLand: local\nCommit: feat(fixture): add the fixture${extra}`);
}

test('plan-check passes a plan with no App: line', () => {
  const report = planCheckReport(planWith(null));
  assert.equal(report.ok, true, report.lines.join('; '));
});

test('plan-check passes an App: line with Ready:', () => {
  const report = planCheckReport(planWith('App: npm start | Ready: http://localhost:3000'));
  assert.equal(report.ok, true, report.lines.join('; '));
});

test('plan-check passes App: none', () => {
  const report = planCheckReport(planWith('App: none'));
  assert.equal(report.ok, true, report.lines.join('; '));
});

test('plan-check flags an App: line without Ready:', () => {
  const report = planCheckReport(planWith('App: npm start'));
  assert.equal(report.ok, false);
  assert.ok(report.lines.some((line) => line.includes("'App:'") && line.includes('Ready:')), report.lines.join('; '));
});
