import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { evaluate, failureLinePrompts, variantPlugin } from '../benchmarks/routing.mjs';
import { armComparison, comparisonLine, mdeLine } from '../benchmarks/routing-stats.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const VARIANT = 'no-failure-lines';
const prompts = JSON.parse(fs.readFileSync(path.join(ROOT, 'benchmarks/routing/prompts.json'), 'utf8'));

test('the variant plugin copy drops lines 4 to 6 of the routing text and keeps lines 1 to 3', () => {
  const copy = variantPlugin(VARIANT);
  try {
    const lines = fs.readFileSync(path.join(copy, 'hooks/session-routing.md'), 'utf8').trimEnd().split('\n');
    const original = fs.readFileSync(path.join(ROOT, 'hooks/session-routing.md'), 'utf8').trimEnd().split('\n');
    assert.deepEqual(lines, original.slice(0, 3));
    assert.ok(fs.existsSync(path.join(copy, 'skills/find-cause')));
  } finally {
    fs.rmSync(path.dirname(copy), { recursive: true, force: true });
  }
});

test('the prompt set holds the 32 find-cause prompts and the 3 known-cause prompts', () => {
  const picked = failureLinePrompts(prompts);
  assert.equal(picked.length, 35);
  assert.equal(picked.filter((entry) => entry.expect === 'find-cause').length, 32);
  assert.equal(picked.filter((entry) => entry.expect === null).length, 3);
});

test('a stubbed session gives the paired hook minus variant difference with its interval and floor', async () => {
  const picked = failureLinePrompts(prompts);
  const runSession = async ({ arm, prompt }) => {
    const entry = picked.find((candidate) => candidate.prompt === prompt);
    const misses = arm === VARIANT && entry.expect === 'find-cause';
    return { pick: misses ? null : entry.expect, cost_usd: 0.03 };
  };
  const outcome = await evaluate({ prompts: picked, cells: ['sonnet:low'], arms: ['hook', VARIANT], runs: 2, concurrency: 4, skills: ['find-cause'], runSession, mode: 'variant' });
  assert.equal(outcome.sessions.length, 140);
  const comparison = armComparison(outcome.sessions, { against: VARIANT });
  assert.equal(comparison.diff.n, 35);
  assert.ok(Math.abs(comparison.diff.mean - 32 / 35) < 1e-9);
  assert.equal(comparison.verdict, 'better');
  assert.match(comparisonLine(comparison, VARIANT), /^hook minus no-failure-lines, paired per prompt: .*ci95/);
  assert.match(mdeLine(comparison), /^power: 35 tasks .*MDE at 35 tasks is 0\.\d+$/);
});

test('--dry-run prints 140 sessions at 2 runs and starts no session', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'routing-variant-')), 'variant.json');
  const run = spawnSync(process.execPath, [path.join(ROOT, 'benchmarks/routing.mjs'), '--variant', VARIANT, '--runs', '2', '--max-budget-usd', '4.20', '--out', out, '--dry-run'], { encoding: 'utf8', timeout: 30_000 });
  fs.rmSync(path.dirname(out), { recursive: true, force: true });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /^dry-run: 140 sessions x median \$0\.\d+ = \$\d+\.\d\d/);
  assert.match(run.stdout, /power: 35 tasks x 2 samples x 2 arms = 140 runs/);
});

test('--variant needs --out so the recorded routing.json stays', () => {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'benchmarks/routing.mjs'), '--variant', VARIANT, '--dry-run'], { encoding: 'utf8', timeout: 30_000 });
  assert.equal(run.status, 2);
  assert.match(run.stderr, /--variant needs --out/);
});
