import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;
const withGate = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nLand gate: npm run validate:static');

const promptTask = (proof) => compactTask({ number: 1, title: 'feat(prompt): add the skill', files: ['skills/prompt/SKILL.md'], proof });

test('plan-check flags a task whose Proof is the Land gate and has no Red line', () => {
  const plan = withGate(compactPlanFixture({ tasks: [promptTask('npm run validate:static')] }));
  for (const loop of [false, true]) {
    const report = planCheckReport(plan, { root: process.cwd(), loop });
    assert.ok(report.lines.some((line) => line.includes('Task 1:') && line.includes('no red proof')), `loop=${loop}: ${report.lines.join('; ')}`);
  }
});

test('plan-check accepts a task whose Proof differs from the Land gate', () => {
  const plan = withGate(compactPlanFixture({ tasks: [promptTask('node --test tests/land-gate.test.mjs')] }));
  const report = planCheckReport(plan, { root: process.cwd() });
  assert.ok(!report.lines.some((line) => line.includes('no red proof')), report.lines.join('; '));
});

test('plan-check flags a refactor task with no Red field, and passes one with Red: none or another heading type', () => {
  const refactorTask = (title, red) => compactTask({ number: 1, title, files: ['src/widget.mjs'], proof: 'node --test tests/widget.test.mjs' })
    .replace(' | Proof:', red === null ? ' | Proof:' : ` | Red: ${red} | Proof:`);
  const flagged = (title, red = null) => planCheckReport(compactPlanFixture({ tasks: [refactorTask(title, red)] })).lines
    .some((line) => line.startsWith('Task 1:') && line.includes("refactor task has no 'Red:' field") && line.includes("Red: none (<reason>)"));
  assert.ok(flagged('refactor(widget): split the module'));
  assert.ok(flagged('refactor: split the module'));
  assert.ok(!flagged('refactor(widget): split the module', 'none (no behavior change)'));
  assert.ok(!flagged('feat(widget): round'));
});
