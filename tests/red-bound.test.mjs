
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { landTask } from '../skills/build/scripts/land-task.mjs';
import { runInWorktree } from '../lib/red-green.mjs';
import { git, restoreEnv, run } from './harness.mjs';
import { CHANGED, COMPACT_PLAN, PASS_REPORT, PLAN, SCRIPT, compactCheckout, editApp, landingCheckout } from './land-task-fixture.mjs';

const inBase = (body) => `if pwd | grep -q red-green-; then ${body}; fi`;
const HANGS_AFTER_FAILING = inBase('echo "not ok 1 - boom"; sleep 300');
const PASSES_AFTER_MINUTES = inBase('sleep 300');

async function withEnv(settings, body) {
  const saved = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]));
  Object.assign(process.env, settings);
  try {
    return await body();
  } finally {
    restoreEnv(saved);
  }
}

const TINY = { EXO_RED_BASE_MARGIN_MS: '1000', EXO_PROOF_TIMEOUT_MS: '600000' };

async function landWith(command) {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const planText = PLAN.replaceAll(CHANGED, command);
  await fs.writeFile(planPath, planText);
  return () => landTask({ planPath, planText, number: 1, root });
}

test('a base that prints a failure and never exits is red within head plus margin, not error', async () => {
  const land = await landWith(HANGS_AFTER_FAILING);
  const result = await withEnv(TINY, land);
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a base that passes only after far more than head plus margin is red at the bound', async () => {
  const land = await landWith(PASSES_AFTER_MINUTES);
  const result = await withEnv(TINY, land);
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a base that exits non-zero fast is red, as before', async () => {
  const land = await landWith(CHANGED);
  const result = await withEnv(TINY, land);
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

async function assertRefused(command, env = { ...TINY, EXO_RED_BASE_MARGIN_MS: '600000' }) {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  await fs.writeFile(planPath, PLAN.replaceAll(CHANGED, `${command} # src/app.js`));
  const head = git(root, 'rev-parse', 'HEAD');
  const result = await run(SCRIPT, ['--plan', planPath, '--task', '1', '--root', root], { cwd: root, env });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /Task 1: Proof .* passes on .* proves nothing/);
  assert.equal(git(root, 'rev-parse', 'HEAD'), head);
  assert.doesNotMatch(git(root, 'log', '--format=%B'), /^Plan-task:/m);
}

test('a base that passes fast is refused as no red proof and nothing lands', () => assertRefused('true'));

test('a base that passes within head plus margin is refused as no red proof and nothing lands', () => assertRefused(inBase('sleep 0.3'), { ...TINY, EXO_RED_BASE_MARGIN_MS: '600000' }));

test('a task whose changed files hold no recognized test lands with a skipped Red line', async () => {
  const land = await landWith('true');
  const result = await withEnv(TINY, land);
  assert.match(result, /^Red: skipped: no test file seen$/m);
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('Red: none lands a proof that passes at the base', async () => {
  const { root, planPath } = await compactCheckout(COMPACT_PLAN.replace('node tests/app.test.mjs', 'true'));
  const planText = await fs.readFile(planPath, 'utf8');
  const result = landTask({ planPath, planText, number: 1, root, reportText: PASS_REPORT.replace('node tests/app.test.mjs', 'true') });
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('runInWorktree names both times in the red line of a base stopped at the bound', async () => {
  const { root } = await landingCheckout();
  const result = await withEnv(TINY, () => runInWorktree({
    root, base: 'HEAD', command: HANGS_AFTER_FAILING, overlay: [], timeoutMs: 4000, headMs: 100
  }));
  assert.equal(result.status, 'red');
  assert.match(result.output, /not ok 1 - boom/);
  assert.match(result.output, /base run did not finish within 1\.1 s; head run took 0\.1 s/);
});

test('runInWorktree without a head time still reports the proof timeout as error', async () => {
  const { root } = await landingCheckout();
  const result = await withEnv(TINY, () => runInWorktree({ root, base: 'HEAD', command: HANGS_AFTER_FAILING, overlay: [], timeoutMs: 1500 }));
  assert.equal(result.status, 'error');
  assert.match(result.output, /timed out after 1500 ms/);
});

test('runInWorktree keeps error when the bound reaches the proof timeout', async () => {
  const { root } = await landingCheckout();
  const result = await withEnv(TINY, () => runInWorktree({ root, base: 'HEAD', command: HANGS_AFTER_FAILING, overlay: [], timeoutMs: 1000, headMs: 100 }));
  assert.equal(result.status, 'error');
});
