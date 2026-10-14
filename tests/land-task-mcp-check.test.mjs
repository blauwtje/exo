// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkTask, landTask } from '../skills/build/scripts/land-task.mjs';
import { compactPlanFixture, git, run } from './harness.mjs';
import {
  compactTask, SCRIPT, cacheFile, COMPACT_PLAN, PASS_REPORT, compactCheckout, writeReport, assertRefused, OLDER_PLAN,
  MCP_PLAN
} from './land-task-fixture.mjs';

test('an mcp: Proof reported deferred lands and prints it pending for the session', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  const report = 'Landed: src/app.js\nProof:\n- `npm run lint`: pass\n  0 problems\n- `mcp:run_playtest mode=play`: deferred\nUnresolved: none\n';
  const output = landTask({ planPath, planText: MCP_PLAN, number: 1, root, reportText: report });
  assert.match(output, /^Committed: [0-9a-f]+ Task 1\nPending: mcp:run_playtest mode=play\nLanded: 1$/m);
  assert.doesNotMatch(output, /^Proof:/m);
  assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
});

test('not done without proof: an mcp: Proof with no deferred line, a claimed pass, or a failing command beside it is refused', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  await writeReport(root, 'Landed: src/app.js\nProof:\n- `npm run lint`: pass\n  0 problems\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /no "mcp:run_playtest mode=play: deferred" line/);
  await writeReport(root, 'Proof:\nmcp:run_playtest mode=play: pass\n  playtest ok\n');
  await assertRefused(root, planPath, [], /reads "mcp:run_playtest mode=play: pass", yet only the session runs an MCP tool Proof/);
  await writeReport(root, 'Proof:\nmcp:run_playtest mode=play: deferred\nnpm test: fail\n  ✖ greet\nUnresolved: none\n');
  await assertRefused(root, planPath, [], /lists "npm test: fail" under Proof, no clear pass/);
  await assertRefused(root, planPath, ['--report', path.join(root, 'missing.md')], /no build report/);
});

test('an mcp: Proof lands through the CLI with its Pending line', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  await writeReport(root, 'Proof:\nmcp:run_playtest mode=play: deferred\nUnresolved: none\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Pending: mcp:run_playtest mode=play$/m);
});

// A Proof starting with a known MCP tool's short name, written without `mcp:`,
// is the same session-only call: never spawned, landed on a deferred line in
// the plan's own form or the `mcp:` one, and pending in its `mcp:` form.
const UNPREFIXED_MCP_PLAN = compactPlanFixture({ tasks: [
  compactTask({ number: 1, title: 'feat(app): greet', files: ['src/app.js'], proof: 'run_playtest mode=play; touch spawned.txt' })
] });

test('an unprefixed known MCP tool Proof is never spawned and lands deferred like an mcp: Proof', async () => {
  for (const written of ['run_playtest mode=play; touch spawned.txt', 'mcp:run_playtest mode=play; touch spawned.txt']) {
    const { root, planPath } = await compactCheckout(UNPREFIXED_MCP_PLAN);
    const report = `Landed: src/app.js\nProof:\n- \`${written}\`: deferred\nUnresolved: none\n`;
    const output = landTask({ planPath, planText: UNPREFIXED_MCP_PLAN, number: 1, root, reportText: report });
    assert.match(output, /^Committed: [0-9a-f]+ Task 1\nPending: mcp:run_playtest mode=play; touch spawned\.txt\nLanded: 1$/m);
    await assert.rejects(fs.access(path.join(root, 'spawned.txt')));
    assert.equal(git(root, 'status', '--porcelain', '--', '.', ':!.exo'), ''); // .exo/ is excluded in a real checkout
  }
  const { root, planPath } = await compactCheckout(UNPREFIXED_MCP_PLAN);
  await writeReport(root, 'Proof:\nnpm run lint: pass\n  0 problems\n');
  await assertRefused(root, planPath, [], /no "run_playtest mode=play; touch spawned\.txt: deferred" line/);
  await writeReport(root, 'Proof:\nrun_playtest mode=play; touch spawned.txt: fail\n  bash: run_playtest: command not found\n');
  await assertRefused(root, planPath, [], /reads "run_playtest mode=play; touch spawned\.txt: fail", yet only the session runs an MCP tool Proof/);
  await assert.rejects(fs.access(path.join(root, 'spawned.txt')));
});

// A report refusal ends with the whole expected layout, so one round fixes
// every report fault.
function assertLayout(stderr, { deferred = false, command = 'node tests/app.test.mjs' } = {}) {
  assert.match(stderr, /^Expected under Proof: in .+:$/m);
  const outcome = deferred ? 'deferred' : 'pass';
  assert.ok(stderr.includes(`\n${command}: ${outcome}`), stderr);
}

test('every report refusal ends with the expected layout filled with the task command', async () => {
  const { root, planPath } = await compactCheckout();
  const refuse = async () => (await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root })).stderr;
  assertLayout(await refuse());
  const older = await compactCheckout(OLDER_PLAN);
  await writeReport(older.root, 'Proof: fine\n');
  assertLayout((await run(SCRIPT, ['--plan', older.planPath, '--task', '1', '--root', older.root], { cwd: older.root })).stderr, { command: '<test command>' });
});

test('an mcp: Proof refusal ends with the deferred layout and no output lines', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  await writeReport(root, 'Proof:\nnpm run lint: pass\n  0 problems\n');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root });
  assert.equal(result.code, 1);
  assertLayout(result.stderr, { deferred: true, command: 'mcp:run_playtest mode=play' });
});

test('--check validates the unplanned paths and the report, and commits nothing', async () => {
  const { root, planPath } = await compactCheckout();
  const head = git(root, 'rev-parse', 'HEAD');
  const check = (...extra) => run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root, '--check', ...extra], { cwd: root });
  const missing = await check();
  assert.equal(missing.code, 1);
  assert.match(missing.stderr, /no build report/);
  await writeReport(root, PASS_REPORT);
  const ok = await check();
  assert.equal(ok.code, 0, ok.stderr);
  assert.equal(ok.stdout, 'Report OK: Task 1\n');
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
  await assert.rejects(fs.access(cacheFile(root)));
  await fs.writeFile(path.join(root, 'src/extra.js'), 'export const extra = 1;\n');
  const unplanned = await check();
  assert.equal(unplanned.code, 1);
  assert.match(unplanned.stderr, /outside Files: `src\/extra\.js`/);
});

test('--check runs the Land gate and Lint, refusing a failure and returning a skip line before Report OK', async () => {
  const withBasis = (line) => COMPACT_PLAN.replace('## Plan basis\n', `## Plan basis\n${line}\n`);
  const check = async (planText) => {
    const { root, planPath } = await compactCheckout(planText);
    await writeReport(root, PASS_REPORT);
    return { root, planPath, planText: await fs.readFile(planPath, 'utf8') };
  };
  const gate = await check(withBasis('Land gate: echo gate broke && exit 1'));
  assert.throws(() => checkTask({ ...gate, number: 1, reportText: PASS_REPORT }), /Land gate "echo gate broke && exit 1" failed:\ngate broke/);
  const lint = await check(withBasis('Lint: false'));
  assert.throws(() => checkTask({ ...lint, number: 1, reportText: PASS_REPORT }), /Lint "false" failed/);
  const ok = await check(withBasis('Land gate: true'));
  assert.equal(checkTask({ ...ok, number: 1, reportText: PASS_REPORT }), 'Report OK: Task 1\n');
  assert.equal(
    checkTask({ ...ok, number: 1, reportText: PASS_REPORT }),
    'Land gate "true" skipped: it already passed on this tree.\nReport OK: Task 1\n'
  );
  assert.match(landTask({ ...ok, number: 1, reportText: PASS_REPORT }), /^Land gate "true" skipped: it already passed on this tree\.$/m);
  const changed = await check(withBasis('Land gate: true'));
  checkTask({ ...changed, number: 1, reportText: PASS_REPORT });
  await fs.appendFile(path.join(changed.root, 'src/app.js'), 'export const edited = true;\n');
  assert.doesNotMatch(landTask({ ...changed, number: 1, reportText: PASS_REPORT }), /skipped/);
});
