import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { mannWhitney, meanAndSd, minDetectableEffect, minDetectableMeanEffect, signTest } from '../benchmarks/statistics.mjs';
import { summarize } from '../benchmarks/lean-gates-metrics.mjs';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');

const USAGE = { counts: { weightedInput: 1000, output: 500 }, subagents: [] };

function writeCell(runs, where, files) {
  const cell = path.join(runs, where.task, where.arm, '1');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify(files.checks));
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify(files.result));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify(USAGE));
}

function score(runs, extra = []) {
  return spawnSync(process.execPath, [SCORE, runs, ...extra], { encoding: 'utf8' });
}

test('meanAndSd gives no spread for one value', () => {
  assert.deepEqual(meanAndSd([4]), { mean: 4, sd: null, n: 1 });
  assert.deepEqual(meanAndSd([]), { mean: null, sd: null, n: 0 });
  assert.equal(meanAndSd([2, 4]).sd, Math.SQRT2 * 1);
});

test('score prints (n=1) for one-cell arms in the template and value tables', () => {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-stats-'));
  const meta = {
    model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: 1, date: '2026-01-01',
    arms: ['baseline', 'exo'], tasks: ['t'], cells: 2, mode: 'x'
  };
  fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
  for (const arm of meta.arms) {
    writeCell(runs, { task: 't', arm }, { checks: { tier: 'template', correct: true, loc: { added: 10 } }, result: { total_cost_usd: 1, duration_ms: 60000 } });
  }
  writeCell(runs, { task: 'v', arm: 'exo' }, { checks: { tier: 'value', pass: true, defects: 0, loc: { added: 5 }, wallMs: 60000 }, result: { total_cost_usd: 1 } });
  const output = score(runs);
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /\$1\.00 \(n=1\)/);
  assert.match(output.stdout, /\| 100% \(n=1\) \|/);
  assert.doesNotMatch(output.stdout, /±0/);
  const published = score(runs, ['--publish', '--results', path.join(runs, 'out.md')]);
  assert.equal(published.status, 0, published.stderr);
  assert.match(published.stdout, /"spread":\{"lines":null,"tokens":null,"cost":null,"time":null\}/);
});

test('lean-gates summarize keeps a null sd for one run', () => {
  assert.equal(summarize([3]).sd, null);
});

test('signTest gives the one-sided binomial p and drops ties', () => {
  assert.equal(signTest([[0, 1], [0, 1], [0, 1], [0, 1], [0, 1]]).p, 1 / 32);
  assert.deepEqual(signTest([[1, 1], [0, 1], [2, 1]]), { wins: 1, n: 2, p: 0.75 });
  assert.equal(signTest([]).p, 1);
});

test('minDetectableEffect and the mde script agree', () => {
  const effect = minDetectableEffect({ rate: 0.5, n: 100 });
  assert.ok(Math.abs(effect - 2.84 * Math.sqrt(0.005)) < 1e-12);
  assert.ok(Math.abs(minDetectableEffect({ rate: 0.5, n: 10 }) - 2.84 * Math.sqrt(0.05)) < 1e-12);
  assert.ok(minDetectableEffect({ rate: 0.9, n: 2 }) > 0.1);
  const run = spawnSync(process.execPath, [path.join(import.meta.dirname, '..', 'benchmarks', 'mde.mjs'), '--rate', '0.5', '--n', '100'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /min detectable effect: 0\.201\n/);
});

test('the mde script prints undetectable, not the cap, when the uncapped effect exceeds 1 - rate', () => {
  const mde = path.join(import.meta.dirname, '..', 'benchmarks', 'mde.mjs');
  const out = (n) => spawnSync(process.execPath, [mde, '--rate', '0.7', '--n', n], { encoding: 'utf8' }).stdout;
  assert.match(out('3'), /min detectable effect: undetectable at n=3 \(needs 1\.063, the largest possible effect is 0\.300\)/);
  assert.match(out('30'), /undetectable at n=30 \(needs 0\.336,/);
  assert.match(out('100'), /min detectable effect: 0\.184\n/);
  assert.doesNotMatch(out('100'), /undetectable/);
});

test('minDetectableMeanEffect scales with spread and shrinks with runs', () => {
  assert.ok(Math.abs(minDetectableMeanEffect({ sd: 1, n: 2 }) - 2.84) < 1e-9);
  assert.ok(Math.abs(minDetectableMeanEffect({ sd: 0.5, n: 8 }) - 2.84 * 0.5 * 0.5) < 1e-9);
});

test('mannWhitney matches the reference two-sided p, ties included', () => {
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} vs ${expected}`);
  near(mannWhitney([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]), 0.009023438818080336);
  near(mannWhitney([1, 2, 2, 3], [2, 3, 4, 4, 5]), 0.059451093311553654);
  near(mannWhitney([1, 2, 3], [1.5, 2.5, 3.5, 9]), 0.28884436634648497);
  assert.equal(mannWhitney([2, 2], [2, 2, 2]), 1);
});
