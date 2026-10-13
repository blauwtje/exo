// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, git, run } from './harness.mjs';
import {
  compactTask, SCRIPT, COMPACT_PLAN, PASS_REPORT, compactCheckout, writeReport, assertRefused
} from './land-task-fixture.mjs';

// land-task runs the Proof itself in the checkout, so the report's word never
// lands a task.
test('a failing Proof refuses the landing with its exit status and output, and commits nothing', async () => {
  const { root, planPath } = await compactCheckout();
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "bye";\n}\n');
  await writeReport(root, PASS_REPORT);
  await assertRefused(root, planPath, [], /^land-task: Task 1: the Proof: command "node tests\/app\.test\.mjs" failed \(exit 1\):\n {2}# pass 2\n {2}✖ greet returns "hello", got "bye"$/m);
});

test('a compact task with no Commit: block lands on a derived commit and trailer', async () => {
  const { root, planPath } = await compactCheckout();
  const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'feat(app): greet');
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
  assert.deepEqual(git(root, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n'), ['src/app.js']);
});

test('a compact task that removed a path with git rm lands the removal beside its edit', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js', 'src/old.mjs'], proof: 'node tests/app.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  await fs.writeFile(path.join(root, 'src/old.mjs'), 'export const old = 1;\n');
  git(root, 'add', 'src/old.mjs');
  git(root, 'commit', '-m', 'add old');
  git(root, 'rm', 'src/old.mjs');
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.deepEqual(git(root, 'diff', '--name-status', 'HEAD~1', 'HEAD').split('\n'), ['M\tsrc/app.js', 'D\tsrc/old.mjs']);
});

test('a compact task that moved a listed path with git mv lands the rename beside its edit', async () => {
  const plan = compactPlanFixture({ tasks: [
    compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js', 'src/old.mjs', 'src/new.mjs'], proof: 'node tests/app.test.mjs' })
  ] });
  const { root, planPath } = await compactCheckout(plan);
  await fs.writeFile(path.join(root, 'src/old.mjs'), 'export const old = 1;\n');
  git(root, 'add', 'src/old.mjs');
  git(root, 'commit', '-m', 'add old');
  git(root, 'mv', 'src/old.mjs', 'src/new.mjs');
  const output = landTask({ planPath, planText: plan, number: 1, root, reportText: PASS_REPORT });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.deepEqual(git(root, 'diff', '--name-status', '--no-renames', 'HEAD~1', 'HEAD').split('\n'), ['M\tsrc/app.js', 'A\tsrc/new.mjs', 'D\tsrc/old.mjs']);
});

test('not done without proof: a compact task with no build report is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await assertRefused(root, planPath, [], /no build report/);
  await assertRefused(root, planPath, ['--report', path.join(root, 'missing.md')], /no build report/);
});

test('not done without proof: a passing Proof: beside another failing command in the Proof section is refused', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, [
    'Landed: src/app.js',
    'Proof:',
    'node tests/app.test.mjs: pass',
    '  # pass 3',
    'npm test: fail (13 of 14 pass; the one failure is outside Files, see Unresolved)',
    '  ✖ importRows turns each bank row into an entry',
    '',
    'Unresolved:',
    '- npm test: fail until a follow-up task passes the date through importRows.',
    ''
  ].join('\n'));
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: fail \(13 of 14 pass; the one failure is outside Files, see Unresolved\)" under Proof, no clear pass$/m);
});

test('not done without proof: a bare "fail" line or a backticked failing word in the Proof section is refused', async () => {
  const { root, planPath } = await compactCheckout();
  const passing = 'Proof:\n- `node tests/app.test.mjs`: pass\n  # pass 3\n';
  await writeReport(root, `${passing}npm test: fail\n  ✖ importRows\nUnresolved: none\n`);
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: fail" under Proof, no clear pass$/m);
  await writeReport(root, `${passing}- \`npm test\`: failing on importRows\n  ✖ importRows\nUnresolved: none\n`);
  await assertRefused(root, planPath, [], /^land-task: Task 1: the build report lists "npm test: failing on importRows" under Proof, no clear pass$/m);
});

// A bare colon line under a passing command is as likely that command's own
// output, so a test name holding "fail" does not refuse a green task.
test('a passing proof whose output names a failing case still lands', async () => {
  for (const outputLine of ['ok 3 - parser: fails on empty input', '✔ importRows: failed rows are skipped (2ms)']) {
    const { root, planPath } = await compactCheckout();
    const report = `Proof:\n- \`node tests/app.test.mjs\`: pass\n  ${outputLine}\n  # fail 0\nUnresolved: none\n`;
    const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: report });
    assert.match(output, /^Landed: 1$/m, outputLine);
  }
});

test('a Proof section whose every command passes still lands', async () => {
  const { root, planPath } = await compactCheckout();
  const report = 'Proof:\n- `node tests/app.test.mjs`: pass\n  # pass 3\n  # fail 0\n- `npm test`: pass\n  # fail 0\nUnresolved: none\n';
  const output = landTask({ planPath, planText: COMPACT_PLAN, number: 1, root, reportText: report });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(output, /^Landed: 1$/m);
});

test('a passing Proof lands and records the SHA, the exit status and the output land-task observed', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, PASS_REPORT);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const sha = git(root, 'rev-parse', '--short', 'HEAD');
  assert.match(result.stdout, new RegExp(`^Committed: ${sha} Task 1$`, 'm'));
  assert.match(result.stdout, /^Proof: node tests\/app\.test\.mjs: pass \(exit 0\)\n {2}# pass 3\n {2}# fail 0$/m);
  assert.equal(git(root, 'log', '-1', '--format=%s'), 'feat(app): greet');
});
