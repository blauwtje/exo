import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { KILL_GRACE_MS, runBounded } from '../lib/bounded-command.mjs';
import { failedCriterionLines } from '../skills/gate/scripts/gate-criterion.mjs';
import { gitRepository } from './harness.mjs';

const FAILING_SPEC = "import test from 'node:test'; test('x', () => { throw new Error('no'); });";
const FAILED_OUTPUT = 'test at bad.test.mjs:1:1\nlast output line\n';
const context = (root) => ({ plan: { tasks: [] }, landed: new Set(), root, base: 'HEAD' });

test('a hung criterion is a timeout failure even when its partial output names a spec failing on base', async () => {
  const root = await gitRepository({ 'bad.test.mjs': FAILING_SPEC });
  const deadlineMs = 300;
  const started = Date.now();
  const gateRun = await runBounded(`printf '${FAILED_OUTPUT}'; sleep 30`, deadlineMs);
  assert.ok(Date.now() - started < deadlineMs + KILL_GRACE_MS);
  const outcome = await failedCriterionLines(gateRun, context(root));
  assert.equal(outcome.failed, true);
  assert.equal(outcome.lines[0], 'FAIL success-criterion (timed out after 0.3s)');
  assert.ok(outcome.lines.includes('  last output line'));
  fs.rmSync(root, { recursive: true, force: true });
});

test('a spec failing on the branch and on base prints the also-fails-on-base SKIP and no failure', async () => {
  const root = await gitRepository({ 'bad.test.mjs': FAILING_SPEC });
  const gateRun = { ok: false, code: 1, signal: null, output: FAILED_OUTPUT };
  const outcome = await failedCriterionLines(gateRun, context(root));
  assert.equal(outcome.failed, false);
  assert.ok(outcome.lines[0].startsWith('SKIP success-criterion (also fails on base: bad.test.mjs'), outcome.lines[0]);
  assert.ok(outcome.lines.includes('  last output line'));
  assert.ok(!outcome.lines.some((line) => line.startsWith('FAIL ')));
  fs.rmSync(root, { recursive: true, force: true });
});
