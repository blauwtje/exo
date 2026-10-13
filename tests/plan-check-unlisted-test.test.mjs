import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask, gitRepository } = harness;

function planWith(root, files) {
  const task = compactTask({ number: 1, title: 'fix(widget): round', files, proof: 'node --test tests/widget.test.mjs' });
  return compactPlanFixture({ tasks: [task] })
    .replace(/^(Branch: .+)$/m, '$1\nLand: local')
    .replace('Repository: /tmp/fixture', `Repository: ${root}`);
}

test('plan-check flags a source file whose existing tests the task does not list', async () => {
  const root = await gitRepository({
    'src/widget.mjs': 'export const x = 1;\n',
    'tests/widget.test.mjs': '// pins x\n',
    'tests/widget-round.test.mjs': '// pins rounding\n'
  });
  const flagged = planCheckReport(planWith(root, ['src/widget.mjs']));
  assert.equal(flagged.ok, false);
  const line = flagged.lines.find((entry) => entry.includes('src/widget.mjs'));
  assert.ok(line?.startsWith('Task 1:') && line.includes('tests/widget.test.mjs') && line.includes('tests/widget-round.test.mjs'), flagged.lines.join('; '));
  const listed = planCheckReport(planWith(root, ['src/widget.mjs', 'tests/widget-round.test.mjs']));
  assert.ok(!listed.lines.some((entry) => entry.includes('tests/widget.test.mjs')), listed.lines.join('; '));
});
