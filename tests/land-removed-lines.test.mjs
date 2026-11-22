import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { compactPlanFixture, run } from './harness.mjs';
import { COMPACT_PLAN, PASS_REPORT, SCRIPT, compactCheckout, compactTask } from './land-task-fixture.mjs';

const PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js', 'tests/greet.test.mjs'], proof: 'node tests/app.test.mjs' })
] });

const land = (root, planPath) => run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', '-'], { cwd: root, input: PASS_REPORT });

test('a landing that removes a test line lists it between the gate line and Landed', async () => {
  const { root, planPath } = await compactCheckout(PLAN);
  fs.writeFileSync(path.join(root, 'tests/greet.test.mjs'), "  console.log('# pass 2');\n");
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.match(landed.stdout, /^Removed test lines: 1\n- tests\/greet\.test\.mjs: console\.log\('# pass 1'\);\n(?:Pending: .*\n)?Landed: /m);
  assert.doesNotMatch(landed.stdout, /^ {2}/m);
});

test('a landing that only adds test lines prints no block', async () => {
  const { root, planPath } = await compactCheckout(PLAN);
  fs.appendFileSync(path.join(root, 'tests/greet.test.mjs'), "console.log('# pass 2');\n");
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.doesNotMatch(landed.stdout, /Removed test lines/);
});

test('a removed line outside a test file is not listed', async () => {
  const { root, planPath } = await compactCheckout(COMPACT_PLAN);
  const landed = await land(root, planPath);
  assert.equal(landed.code, 0, landed.stderr);
  assert.doesNotMatch(landed.stdout, /Removed test lines/);
});
