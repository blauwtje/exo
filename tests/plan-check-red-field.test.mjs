import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;
const withGate = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nCommit: feat(fixture): add the fixture\nLand gate: npm run validate:static');

const promptTask = (proof) => compactTask({ number: 1, title: 'feat(prompt): add the skill', files: ['skills/prompt/SKILL.md', 'verify/checks/reference-tables.mjs', 'tests/prompt-skill.test.mjs'], proof });

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

test('plan-check flags a task whose Files are all tests and has no Red field, and passes one with a source file or a Red field', () => {
  const taskOf = (files, red = null) => compactTask({ number: 1, title: 'feat(widget): round', files, proof: 'node --test tests/widget.test.mjs' })
    .replace(' | Proof:', red === null ? ' | Proof:' : ` | Red: ${red} | Proof:`);
  const flagged = (files, red) => planCheckReport(compactPlanFixture({ tasks: [taskOf(files, red)] })).lines
    .some((line) => line.startsWith('Task 1:') && line.includes('Files are all tests') && line.includes('Red: none (<reason>)'));
  assert.ok(flagged(['tests/widget.test.mjs']));
  assert.ok(!flagged(['src/widget.mjs', 'tests/widget.test.mjs']));
  assert.ok(!flagged(['tests/widget.test.mjs'], 'none (the test covers existing behavior)'));
});

test('plan-check under --run skips the refactor-without-Red check of a task that already landed', async () => {
  const root = await harness.gitRepository({ 'src/widget.mjs': 'export const x = 1;\n' });
  harness.git(root, 'switch', '-q', '-c', 'feat/fixture');
  harness.git(root, 'commit', '-q', '--allow-empty', '-m', 'refactor(widget): split the module', '-m', 'Plan-task: refactor-landed/1');
  const planPath = path.join(await harness.fixture(), 'refactor-landed.md');
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'refactor(widget): split the module', files: ['src/widget.mjs'], proof: 'node --test tests/widget.test.mjs' })] });
  fs.writeFileSync(planPath, plan);
  const flagged = (report) => report.lines.some((line) => line.includes("refactor task has no 'Red:' field"));
  assert.ok(flagged(planCheckReport(plan, { root, planPath })));
  const resumed = planCheckReport(plan, { root, planPath, run: true });
  assert.ok(!flagged(resumed), resumed.lines.join('; '));
});
