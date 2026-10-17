// The red check's base run is bounded by the head run's time plus EXO_RED_BASE_MARGIN_MS,
// not only by the proof timeout: a base that stays alive past that bound is red, not error.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { landTask, LandingError } from '../skills/build/scripts/land-task.mjs';
import { redGreen, runOnBase } from '../lib/red-green.mjs';
import { commitFiles, gitRepository } from './harness.mjs';
import { CHANGED, PLAN, editApp, landingCheckout } from './land-task-fixture.mjs';

// The proof passes in the checkout; in the temporary red-green-* tree the base run starts.
const inBase = (body) => `if pwd | grep -q red-green-; then ${body}; fi`;
const HANGS_AFTER_FAILING = inBase('echo "not ok 1 - boom"; sleep 300');
const PASSES_AFTER_MINUTES = inBase('sleep 300');
const PASSES_AFTER_SECONDS = inBase('sleep 4');

async function withEnv(settings, body) {
  const saved = Object.fromEntries(Object.keys(settings).map((name) => [name, process.env[name]]));
  Object.assign(process.env, settings);
  try {
    return await body();
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const TINY = { EXO_RED_BASE_MARGIN_MS: '1500', EXO_PROOF_TIMEOUT_MS: '8000' };

async function landWith(command) {
  const { root, planPath } = await landingCheckout();
  await editApp(root);
  const planText = PLAN.replaceAll(CHANGED, command);
  await fs.writeFile(planPath, planText);
  return () => landTask({ planPath, planText, number: 1, root });
}

async function timed(body) {
  const started = Date.now();
  const result = await body();
  return { result, ms: Date.now() - started };
}

test('a base that prints a failure and never exits is red within head plus margin, not error', async () => {
  const land = await landWith(HANGS_AFTER_FAILING);
  const { result, ms } = await timed(() => withEnv(TINY, land));
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.ok(ms < 7000, `took ${ms} ms`);
});

test('a base that passes only after far more than head plus margin is red at the bound', async () => {
  const land = await landWith(PASSES_AFTER_MINUTES);
  const { result, ms } = await timed(() => withEnv(TINY, land));
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
  assert.ok(ms < 7000, `took ${ms} ms`);
});

test('a base that exits non-zero fast is red, as before', async () => {
  const land = await landWith(CHANGED);
  const { result } = await timed(() => withEnv(TINY, land));
  assert.match(result, /^Committed: [0-9a-f]+ Task 1$/m);
});

test('a base that passes fast is no red proof, as before', async () => {
  const land = await landWith('true');
  await assert.rejects(() => withEnv(TINY, land), (error) => error instanceof LandingError && /no red proof/.test(error.message));
});

test('a base that passes within head plus margin is no red proof', async () => {
  const land = await landWith(inBase('sleep 0.3'));
  await assert.rejects(() => withEnv(TINY, land), (error) => error instanceof LandingError && /no red proof/.test(error.message));
});

test('runOnBase names both times in the red line of a base stopped at the bound', async () => {
  const { root } = await landingCheckout();
  const { result, ms } = await timed(() => withEnv(TINY, () => runOnBase({
    root, base: 'HEAD', command: HANGS_AFTER_FAILING, timeoutMs: 8000, headMs: 100
  })));
  assert.equal(result.status, 'red');
  assert.match(result.output, /not ok 1 - boom/);
  assert.match(result.output, /base run did not finish within 1\.6 s; head run took 0\.1 s/);
  assert.ok(ms < 7000, `took ${ms} ms`);
});

test('runOnBase without a head time still reports the proof timeout as error', async () => {
  const { root } = await landingCheckout();
  const result = await withEnv(TINY, () => runOnBase({ root, base: 'HEAD', command: HANGS_AFTER_FAILING, timeoutMs: 1500 }));
  assert.equal(result.status, 'error');
  assert.match(result.output, /timed out after 1500 ms/);
});

test('runOnBase keeps error when the bound reaches the proof timeout', async () => {
  const { root } = await landingCheckout();
  const result = await withEnv(TINY, () => runOnBase({ root, base: 'HEAD', command: HANGS_AFTER_FAILING, timeoutMs: 1000, headMs: 100 }));
  assert.equal(result.status, 'error');
});

test('redGreen proves a Success criterion whose base never exits after failing', async () => {
  const root = await gitRepository({ 'a.txt': 'a\n' });
  await commitFiles(root, { ok: 'x\n' }, 'feat: the fix');
  const command = 'if test -f ok; then exit 0; fi; echo "not ok"; sleep 300';
  const { result, ms } = await timed(() => withEnv(TINY, () => redGreen({ root, base: 'HEAD~1', command, timeoutMs: 8000 })));
  assert.equal(result.outcome, 'proved', result.lines.join('\n'));
  assert.ok(ms < 7000, `took ${ms} ms`);
});
