import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture, compactTask, gitRepository } from './harness.mjs';

const BIG_FILE = 'x'.repeat(4_000_000);

test('oversized task warns', async () => {
  const root = await gitRepository({ 'src/big.mjs': BIG_FILE });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit big', files: ['src/big.mjs'] })] });
  const report = planCheckReport(plan, { root, run: true });
  assert.equal(report.ok, true);
  assert.ok(report.lines.some((line) => /^\[WARN\] Task 1: split Task 1 \(about \d+ tokens of task text and Files:, over \d+\)$/.test(line)), report.lines.join('\n'));
});

test('a Proof command not on PATH still fails', async () => {
  const root = await gitRepository({ 'src/a.mjs': 'a\n' });
  const plan = compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'Edit a', files: ['src/a.mjs'], proof: 'no-such-binary-xyz --run' })] });
  const report = planCheckReport(plan, { root, run: true });
  assert.equal(report.ok, false);
  assert.match(report.lines[0], /not on this host's PATH/);
});
