// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { workingTreeKey } from '#check-cache';
import { compactPlanFixture, fixture, git, planFixture, run } from './harness.mjs';
import {
  compactTask, CHANGED, taskSection, SCRIPT, cacheFile, landingCheckout, editApp, PASS_REPORT, compactCheckout,
  writeReport, assertRefused, OLDER_PLAN
} from './land-task-fixture.mjs';

// A long-format task whose red step runs a command that always fails, and
// whose green step runs the app test, so only the green run may decide.
const LONG_PLAN = planFixture({ tasks: [
  taskSection({ number: 1, title: 'Greet', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat(app): greet' })
    .replace(`Run: \`${CHANGED}\`\nExpected: \`pass\``, 'Run: `false`\nExpected: FAIL, greet returns undefined\nRun: `node tests/app.test.mjs`\nExpected: `# fail 0`')
] }).replace('Branch: feat/fixture', 'Branch: feat/fixture\nLand gate: true');

test('a long-format task lands on its passing Run: commands, skipping a red step, and records them', async () => {
  const { root, planPath } = await compactCheckout(LONG_PLAN);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node tests\/app\.test\.mjs: pass \(exit 0\)\n {2}# pass 3\n {2}# fail 0$/m);
  assert.doesNotMatch(result.stdout, /^Proof: false/m);
  const cache = JSON.parse(await fs.readFile(cacheFile(root), 'utf8'));
  assert.deepEqual(Object.keys(cache).sort(), ['node tests/app.test.mjs', 'true']);
  assert.equal(cache['node tests/app.test.mjs'].tree, workingTreeKey(root));
});

test('a landing records each passed proof as the report\'s Proof line, its command, exit status and pass count', async () => {
  const { root, planPath } = await compactCheckout(LONG_PLAN);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const record = await fs.readFile(path.join(root, '.exo/proof-compact-task-1.txt'), 'utf8');
  assert.equal(record, 'Proof: `node tests/app.test.mjs` -> exit 0, # pass 3\nRed: proved\n');
});

// The proof record of a long-format task whose passing Run: command prints `output`.
async function proofRecordFor(output) {
  const command = output === '' ? 'true' : `printf '${output}'`;
  const plan = LONG_PLAN.replace('Run: `node tests/app.test.mjs`\nExpected: `# fail 0`', `Run: \`${command}\`\nExpected: \`pass\`\nRun: \`${CHANGED}\`\nExpected: \`pass\``);
  const { root, planPath } = await compactCheckout(plan);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  const record = await fs.readFile(path.join(root, '.exo/proof-compact-task-1.txt'), 'utf8');
  return record.split('\n').filter((line) => !line.includes('red-green-') && !line.startsWith('Red:')).join('\n');
}

test('a node --test proof records its pass count, not the closing duration line', async () => {
  const record = await proofRecordFor('✔ greet\\nℹ tests 3\\nℹ pass 3\\nℹ fail 0\\nℹ duration_ms 41.2\\n');
  assert.equal(record, "Proof: `printf '✔ greet\\nℹ tests 3\\nℹ pass 3\\nℹ fail 0\\nℹ duration_ms 41.2\\n'` -> exit 0, ℹ pass 3\n");
});

test('a proof with no pass count records its last output line that is not timing', async () => {
  const record = await proofRecordFor('built 2 files\\nDone in 0.4s\\n');
  assert.equal(record, "Proof: `printf 'built 2 files\\nDone in 0.4s\\n'` -> exit 0, built 2 files\n");
});

test('a proof with no output records its exit status alone', async () => {
  assert.equal(await proofRecordFor(''), 'Proof: `true` -> exit 0, no output\n');
});

test('a long-format task whose Run: command fails is refused with its exit status and output, and commits nothing', async () => {
  const { root, planPath } = await compactCheckout(LONG_PLAN);
  await fs.writeFile(path.join(root, 'src/app.js'), 'export function greet() {\n  return "bye";\n}\n');
  await assertRefused(root, planPath, [], /^land-task: Task 1: the Run: command "node tests\/app\.test\.mjs" failed \(exit 1\):\n {2}# pass 2\n {2}✖ greet returns "hello", got "bye"$/m);
});

test('a one-line report with the pass line after a Proof: prefix still lands', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, 'Landed: src/app.js\nProof: node tests/app.test.mjs: pass\n  # pass 3\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node tests\/app\.test\.mjs: pass \(exit 0\)\n {2}# pass 3\n {2}# fail 0$/m);
});

// A test-first report quotes its failing run on a `Red:` line before `Proof:`;
// that `fail` is the red step, never the task's outcome.
const RED_REPORT_HEAD = [
  'Landed: src/app.js',
  'Test first: yes, logic',
  'Red: node tests/app.test.mjs: fail',
  '  AssertionError: expected "hi" but got undefined',
  'Proof:'
];

test('a report with a Red: line before Proof: lands on the Proof: pass', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, [...RED_REPORT_HEAD, '- `node tests/app.test.mjs`: pass', '  # pass 3', 'Unresolved: none', ''].join('\n'));
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node tests\/app\.test\.mjs: pass \(exit 0\)\n {2}# pass 3\n {2}# fail 0$/m);
});

test('a Red: line before Proof: in a report with no Proof: field never counts as the proof or a failing command', async () => {
  const { root, planPath } = await compactCheckout(OLDER_PLAN);
  const report = [...RED_REPORT_HEAD.slice(0, -1), 'node tests/app.test.mjs: pass', '  # pass 3', 'Unresolved: none', ''].join('\n');
  await writeReport(root, report);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node tests\/app\.test\.mjs: pass \(exit 0\)\n {2}# pass 3\n {2}# fail 0$/m);
});

test('a backticked Red: command and a Red: none line both land', async () => {
  for (const red of ['Red: `node tests/app.test.mjs`: fail', 'Red: none, the test cannot fail before the edit']) {
    const { root, planPath } = await compactCheckout(OLDER_PLAN);
    await writeReport(root, ['Landed: src/app.js', 'Test first: yes, logic', red, 'node tests/app.test.mjs: pass', '  # pass 3', 'Unresolved: none', ''].join('\n'));
    const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
    assert.equal(result.code, 0, result.stderr);
  }
});

test('--report names a report outside the default path', async () => {
  const { root, planPath } = await compactCheckout();
  // Outside the checkout entirely: a report path inside root's working tree
  // would itself be an untracked path the new scope check refuses.
  const reportPath = path.join(await fixture(), 'build-report.md');
  await fs.writeFile(reportPath, PASS_REPORT);
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--report', reportPath], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Landed: 1$/m);
});

test('a commit whose subject the plan does not give stops with exit 1', async () => {
  const plan = planFixture({ tasks: [
    taskSection({ number: 1, title: 'Price', files: ['- Modify: `src/app.js` (`greet`)'], subject: 'feat: price in $USD' })
  ] });
  const { root, planPath } = await landingCheckout();
  await fs.writeFile(path.join(root, 'docs/plans/price.md'), plan);
  git(root, 'add', 'docs/plans/price.md');
  git(root, 'commit', '-q', '-m', 'chore: add the price plan');
  await editApp(root);
  const result = await run(SCRIPT, ['--plan', path.join(root, 'docs/plans/price.md'), '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /carries "Plan-task: price\/1", yet its subject reads "feat: price in" and the plan gives "feat: price in \$USD"/);
});

test('a compact task without Proof: lands on the pass line of the test the builder ran', async () => {
  const { root, planPath } = await compactCheckout(OLDER_PLAN);
  await writeReport(root, 'Landed: src/app.js\nProof:\n- `node tests/greet.test.mjs`: pass\n  # pass 1\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Proof: node tests\/greet\.test\.mjs: pass \(exit 0\)\n {2}# pass 1$/m);
  assert.match(result.stdout, /^Landed: 1$/m);
});

test('not done without proof: a compact task without Proof: and no passing test is refused', async () => {
  const { root, planPath } = await compactCheckout(OLDER_PLAN);
  await assertRefused(root, planPath, [], /no build report/);
  await writeReport(root, 'Landed: src/app.js\nProof: the tests look fine\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /no "<test>: pass" line/);
  await writeReport(root, 'node tests/greet.test.mjs: fail\n  # fail 1\n');
  await assertRefused(root, planPath, [], /no clear pass/);
});

// Above eight tasks the report's `Choice:` lines become the decision log
// beside the plan; at eight or fewer nothing is written.
function planOfTasks(count) {
  const tasks = Array.from({ length: count }, (_, index) => compactTask({
    number: index + 1,
    title: `feat(app): step ${index + 1}`,
    files: index === 0 ? ['src/app.js'] : [`src/step-${index + 1}.js`],
    proof: 'node tests/app.test.mjs'
  }));
  return compactPlanFixture({ tasks });
}

const CHOICE_REPORT = PASS_REPORT.replace('Unresolved: none', 'Choice: kept the default timeout\n- Choice: used a plain object\nUnresolved: none');

test('above eight tasks each Choice: line is appended to the decision log beside the plan', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  const output = landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  const sha = git(root, 'rev-parse', '--short', 'HEAD');
  assert.match(output, /^Landed: 1$/m);
  const log = await fs.readFile(path.join(root, 'docs/plans/compact-decisions.md'), 'utf8');
  assert.equal(log, `Task 1 ${sha}: kept the default timeout\nTask 1 ${sha}: used a plain object\n`);
});

test('the decision log is no stray for the next task', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  await fs.writeFile(path.join(root, 'src/step-2.js'), 'export const step = 2;\n');
  const output = landTask({ planText: plan, number: 2, root, reportText: PASS_REPORT, planPath });
  assert.match(output, /^Landed: 1, 2$/m);
});

test('at eight tasks or fewer the Choice: lines write no decision log', async () => {
  const plan = planOfTasks(8);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: CHOICE_REPORT, planPath });
  await assert.rejects(fs.access(path.join(root, 'docs/plans/compact-decisions.md')));
});

test('above eight tasks a report with no Choice: line writes no decision log', async () => {
  const plan = planOfTasks(9);
  const { root, planPath } = await compactCheckout(plan);
  landTask({ planText: plan, number: 1, root, reportText: PASS_REPORT, planPath });
  await assert.rejects(fs.access(path.join(root, 'docs/plans/compact-decisions.md')));
});
