// land-task.mjs runs a task's Commit: block as the plan wrote it, its trailer
// naming the plan, checks the Plan-task: <plan-id>/<n> trailer on the new
// commit and prints the landed set; a compact task
// lands only on a build report whose Proof: command passed.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { checkTask, fixLand, landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { git, run } from './harness.mjs';
import { SCRIPT, COMPACT_PLAN, PASS_REPORT, compactCheckout, writeReport, MCP_PLAN } from './land-task-fixture.mjs';

// Under `EXO_RUN_TASK=<plan-id>/<n>` (run-plan.mjs sets it for each task process) land-task
// serves that one task of that plan: another plan or task, `--fix`, an MCP Proof and a
// malformed value are refused with exit 1 before anything stages or commits.
async function pinnedRun(root, planPath, pin, args = ['--task', '1']) {
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, ...args, '--root', root], { cwd: root, env: { EXO_RUN_TASK: pin } });
  return { result, unmoved: git(root, 'rev-parse', 'HEAD') === head };
}

test('under EXO_RUN_TASK the pinned task of the pinned plan lands as before', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, PASS_REPORT);
  const { result } = await pinnedRun(root, planPath, 'compact/1');
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.match(git(root, 'log', '-1', '--format=%B'), /^Plan-task: compact\/1$/m);
});

test('under EXO_RUN_TASK another plan, another task or a malformed value refuses the landing and the check, committing nothing', async () => {
  const { root, planPath } = await compactCheckout();
  await writeReport(root, PASS_REPORT);
  for (const pin of ['other/1', 'compact/2', 'compact', 'compact/', '/1', 'compact/x', 'compact/1/2', ' compact/1', '']) {
    for (const flag of [[], ['--check']]) {
      const { result, unmoved } = await pinnedRun(root, planPath, pin, ['--task', '1', ...flag]);
      assert.equal(result.code, 1, `${JSON.stringify(pin)} ${flag}: ${result.stderr}`);
      assert.equal(result.stdout, '');
      assert.match(result.stderr, /^land-task: EXO_RUN_TASK /m);
      assert.ok(unmoved);
      assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
    }
  }
});

test('under EXO_RUN_TASK --fix is refused, even with a valid pin, and commits nothing', async () => {
  const { root, planPath } = await compactCheckout();
  for (const pin of ['compact/1', 'garbage']) {
    const { result, unmoved } = await pinnedRun(root, planPath, pin, ['--fix', 'fix: sneak in']);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^land-task: EXO_RUN_TASK /m);
    assert.ok(unmoved);
    assert.match(git(root, 'status', '--porcelain'), /src\/app\.js/);
  }
});

test('under EXO_RUN_TASK a task whose Proof is MCP is refused, for the landing and the check', async () => {
  const { root, planPath } = await compactCheckout(MCP_PLAN);
  await writeReport(root, 'Proof:\nmcp:run_playtest mode=play: deferred\nUnresolved: none\n');
  for (const flag of [[], ['--check']]) {
    const { result, unmoved } = await pinnedRun(root, planPath, 'compact/1', ['--task', '1', ...flag]);
    assert.equal(result.code, 1, result.stderr);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^land-task: EXO_RUN_TASK .*MCP/m);
    assert.ok(unmoved);
  }
});

test('the pin reaches landTask, checkTask and fixLand through their argument', async () => {
  const { root, planPath } = await compactCheckout();
  const head = git(root, 'rev-parse', 'HEAD');
  const call = { planPath, planText: COMPACT_PLAN, number: 1, root, reportText: PASS_REPORT };
  for (const pin of [{ planId: 'other', number: 1 }, { planId: 'compact', number: 2 }]) {
    assert.throws(() => landTask({ ...call, pin }), LandingError);
    assert.throws(() => checkTask({ ...call, pin }), LandingError);
  }
  assert.throws(() => fixLand({ root, subject: 'fix: x', pin: { planId: 'compact', number: 1 } }), LandingError);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.equal(checkTask({ ...call, pin: { planId: 'compact', number: 1 } }), 'Report OK: Task 1\n');
});

test('the Land gate sees the task Drops: value as EXO_DROPS in --check and landing, and the derived commit carries it', async () => {
  const drops = 'only in skills/x/SKILL.md';
  const plan = (task) => COMPACT_PLAN.replace('## Plan basis\n', '## Plan basis\nLand gate: echo "[$EXO_DROPS]" > gate.out && ! git diff --quiet\n')
    .replace(/(### Task 1:.*\nDepends on: none \| Files: `src\/app\.js`)/, `$1${task}`);
  const seen = async (root) => (await fs.readFile(path.join(root, 'gate.out'), 'utf8')).trim();
  const checked = await compactCheckout(plan(` | Drops: ${drops}`));
  await writeReport(checked.root, PASS_REPORT);
  const planText = await fs.readFile(checked.planPath, 'utf8');
  checkTask({ planText, planPath: checked.planPath, number: 1, root: checked.root, reportText: PASS_REPORT });
  assert.equal(await seen(checked.root), `[${drops}]`);
  await fs.rm(path.join(checked.root, 'gate.out'));
  landTask({ planText, planPath: checked.planPath, number: 1, root: checked.root, reportText: PASS_REPORT });
  assert.equal(await seen(checked.root), `[${drops}]`);
  assert.match(git(checked.root, 'log', '-1', '--format=%B'), new RegExp(`^Plan-task: compact/1\\nDrops: ${drops}$`, 'm'));
  assert.equal(process.env.EXO_DROPS, undefined);
  const plain = await compactCheckout(plan(''));
  await writeReport(plain.root, PASS_REPORT);
  landTask({ planText: await fs.readFile(plain.planPath, 'utf8'), planPath: plain.planPath, number: 1, root: plain.root, reportText: PASS_REPORT });
  assert.equal(await seen(plain.root), '[]');
  assert.doesNotMatch(git(plain.root, 'log', '-1', '--format=%B'), /Drops:/);
});
