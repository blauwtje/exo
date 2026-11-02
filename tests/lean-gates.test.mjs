import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ISOLATION_ENV, TIERS, childEnvironment, costSpreadLine, parseArguments, projectedCostLine, recordedRunCosts } from '../benchmarks/lean-gates.mjs';

function savedRun(out, name, stdout) {
  mkdirSync(join(out, name), { recursive: true });
  if (stdout !== undefined) writeFileSync(join(out, name, 'stdout.json'), stdout);
}

test('recordedRunCosts reads total_cost_usd of each saved run and skips probes, unreadable and costless runs', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-gates-costs-'));
  savedRun(out, '01-old', JSON.stringify({ total_cost_usd: 12 }));
  savedRun(out, '02-old', JSON.stringify({ total_cost_usd: 20 }));
  savedRun(out, '03-new', JSON.stringify({ total_cost_usd: 30 }));
  savedRun(out, 'probe-old', JSON.stringify({ total_cost_usd: 0.1 }));
  savedRun(out, '04-new', '{not json');
  savedRun(out, '05-new', JSON.stringify({ result: 'no cost' }));
  savedRun(out, '06-new');
  assert.deepEqual(recordedRunCosts(out).sort((a, b) => a - b), [12, 20, 30]);
});

test('recordedRunCosts is empty for a missing out dir', () => {
  assert.deepEqual(recordedRunCosts(join(tmpdir(), 'lean-gates-no-such-dir')), []);
});

test('projectedCostLine prints the median recorded USD, else cost unknown', () => {
  assert.equal(projectedCostLine([12, 20, 30]), 'projected cost: $20.00 (median of 3 recorded runs)');
  assert.equal(projectedCostLine([10, 20]), 'projected cost: $15.00 (median of 2 recorded runs)');
  assert.equal(projectedCostLine([]), 'projected cost: cost unknown');
});

test('the isolation environment starts sessions on the 5-minute prompt cache', () => {
  assert.equal(ISOLATION_ENV.CLAUDE_CODE_PROMPT_CACHE_TTL, '5m');
  assert.equal(ISOLATION_ENV.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL, '5m');
});

test('childEnvironment keeps the 5-minute prompt cache after stripping the parent CLAUDE_CODE keys', () => {
  const parent = { CLAUDE_CODE_PROMPT_CACHE_TTL: '1h', CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL: '1h' };
  const env = childEnvironment(parent, tmpdir());
  assert.equal(env.CLAUDE_CODE_PROMPT_CACHE_TTL, '5m');
  assert.equal(env.CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL, '5m');
});

const RUN_ARGS = ['--version', 'old', '--run', '1', '--out', '/tmp/lean-out'];

test('parseArguments defaults to the quick tier with its budget and timeout', () => {
  const options = parseArguments(RUN_ARGS);
  assert.equal(options.tier, 'quick');
  assert.equal(options.budget, TIERS.quick.budget);
  assert.equal(options.timeoutMin, TIERS.quick.timeoutMin);
});

test('parseArguments --full restores the whole-build caps and an explicit budget wins over the tier', () => {
  const full = parseArguments([...RUN_ARGS, '--full']);
  assert.deepEqual([full.tier, full.budget, full.timeoutMin], ['full', '30', 110]);
  const capped = parseArguments([...RUN_ARGS, '--full', '--budget', '12']);
  assert.equal(capped.budget, '12');
  assert.equal(capped.timeoutMin, 110);
});

test('costSpreadLine prints the mean with its SE, and no SE for one run', () => {
  assert.equal(costSpreadLine([]), 'cost spread: no recorded runs');
  assert.equal(costSpreadLine([12]), 'cost spread: mean $12.00, no SE (n=1)');
  assert.equal(costSpreadLine([10, 14]), 'cost spread: mean $12.00 ±$2.00 SE (n=2)');
});
