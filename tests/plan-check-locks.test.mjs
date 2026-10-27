import assert from 'node:assert/strict';
import test from 'node:test';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import { compactPlanFixture, compactTask, gitRepository } from './harness.mjs';

async function lockLines(tasks) {
  const root = await gitRepository({
    'benchmarks/big.mjs': 'export {};\n',
    'tests/keep.txt': '',
    'CONTRIBUTING.md': 'The runner lives in benchmarks/big.mjs.\n'
  });
  const plan = compactPlanFixture({ tasks });
  return planCheckReport(plan, { root }).lines.filter((line) => line.includes('CONTRIBUTING.md'));
}

test('a later chained task listing the lock doc credits the earlier task', async () => {
  const lines = await lockLines([
    compactTask({ number: 1, title: 'Change the runner', files: ['benchmarks/big.mjs'] }),
    compactTask({ number: 2, title: 'Document it', dependsOn: '1', files: ['CONTRIBUTING.md'] })
  ]);
  assert.deepEqual(lines, []);
});

test('a task with no later chained task listing the lock doc is still flagged', async () => {
  const lines = await lockLines([
    compactTask({ number: 1, title: 'Change the runner', files: ['benchmarks/big.mjs'] }),
    compactTask({ number: 2, title: 'Document it', files: ['CONTRIBUTING.md'] })
  ]);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /Task 1/);
});
