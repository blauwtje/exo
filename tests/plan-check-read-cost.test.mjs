// A task's Files: are read through Read, which costs about 2 bytes per token,
// so plan-check must flag a task whose text plus Files: pass 50 kB.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { landedTasks, parsePlan, planIdOf } from '../lib/plan-tasks.mjs';
import { planCheckReport } from '../skills/spec/scripts/plan-check.mjs';
import * as harness from './harness.mjs';

const { compactPlanFixture, compactTask } = harness;
const withLand = (plan) => plan.replace(/^(Branch: .+)$/m, '$1\nLand: local\nCommit: feat(fixture): add the fixture');

test('plan-check flags a task whose text and Files: pass 50 kB', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-read-cost-'));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'over.js'), 'x'.repeat(60_000));
  fs.writeFileSync(path.join(root, 'src', 'under.js'), 'x'.repeat(30_000));
  const report = (file) => planCheckReport(withLand(compactPlanFixture({ tasks: [compactTask({ number: 1, title: 'feat(app): greet', files: [file], proof: 'node --test tests/app.test.mjs' })] })), { root });
  const over = report('src/over.js');
  assert.equal(over.ok, false);
  assert.ok(over.lines.some((line) => line.includes('Task 1: split Task 1') && line.includes('tokens')), over.lines.join('; '));
  const under = report('src/under.js');
  assert.equal(under.ok, true, under.lines.join('; '));
});

// A landed task's Files: grow after it lands, so on a resumed run plan-check
// must skip the read cost of each task whose Plan-task trailer is on the branch.
test('plan-check skips the read cost of a task that already landed', async () => {
  const root = await harness.gitRepository({ 'README.md': 'seed\n', 'src/landed.js': 'x'.repeat(60_000), 'src/open.js': 'x'.repeat(60_000) });
  harness.git(root, 'switch', '-q', '-c', 'feat/fixture');
  const planPath = path.join(await harness.fixture(), 'landed-fixture.md');
  harness.git(root, 'commit', '-q', '--allow-empty', '-m', 'feat(app): grow', '-m', 'Plan-task: landed-fixture/1');
  const plan = withLand(compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): grow', files: ['src/landed.js'], proof: 'node --test tests/app.test.mjs' }),
    compactTask({ number: 2, title: 'feat(app): open', dependsOn: 'Task 1', files: ['src/open.js'], proof: 'node --test tests/open.test.mjs' })
  ] }));
  fs.writeFileSync(planPath, plan);
  const report = planCheckReport(plan, { root, planPath, run: true });
  assert.deepEqual(landedTasks(parsePlan(plan).tasks, root, planIdOf(planPath)), [1]);
  const split = report.lines.filter((line) => line.includes('split Task'));
  assert.deepEqual(split.map((line) => line.split(':')[0]), ['Task 2'], report.lines.join('; '));
});

async function forkedRun(seed, grown) {
  const root = await harness.gitRepository({ 'README.md': 'seed\n', ...seed });
  harness.git(root, 'switch', '-q', '-c', 'feat/fixture');
  await harness.commitFiles(root, grown, 'feat(app): an earlier task changes the file');
  const planPath = path.join(await harness.fixture(), 'base-fixture.md');
  const plan = withLand(compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): touch the file', files: ['src/app.js'], proof: 'node --test tests/app.test.mjs' })
  ] }));
  fs.writeFileSync(planPath, plan);
  return (options) => planCheckReport(plan, { root, planPath, ...options }).lines.filter((line) => line.includes('split Task'));
}

test('plan-check under --run flags no task whose Files: grew past the limit after the run forked', async () => {
  const splits = await forkedRun({ 'src/app.js': 'x'.repeat(30_000) }, { 'src/app.js': 'x'.repeat(60_000) });
  assert.deepEqual(splits({ run: true }), []);
});

test('plan-check under --run flags a task whose Files: were over the limit at the run\'s base', async () => {
  const splits = await forkedRun({ 'src/app.js': 'x'.repeat(60_000) }, { 'src/app.js': 'x'.repeat(100) });
  const lines = splits({ run: true });
  assert.deepEqual(lines.map((line) => line.split(':')[0]), ['Task 1'], lines.join('; '));
});

test('plan-check without --run still measures Files: as they are on disk', async () => {
  const splits = await forkedRun({ 'src/app.js': 'x'.repeat(30_000) }, { 'src/app.js': 'x'.repeat(60_000) });
  const lines = splits({});
  assert.deepEqual(lines.map((line) => line.split(':')[0]), ['Task 1'], lines.join('; '));
});
