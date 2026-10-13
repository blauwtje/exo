import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;

test('plan-check --loop accepts a Design: task whose Visual direction names no contract', () => {
  const task = compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], design: 'design-ui', proof: 'node --test tests/app.test.mjs' });
  const plan = compactPlanFixture({ tasks: [task] })
    .replace(/^(Branch: .+)$/m, '$1\nLand: local\nAllow: none')
    .replace('## Tasks', '## Visual direction\nQuiet record.\n\n## Tasks');
  const report = planCheckReport(plan, { loop: true });
  assert.deepEqual(report.lines.filter((line) => line.startsWith('loop: ')), []);
});
