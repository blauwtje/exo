import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { Spend, judgeRate, parseArgs, projectDryRun, runDryRun, runScore } from '../benchmarks/adhd-score.mjs';

const cases = [
  { id: 'a', context: 'C', question: 'Q', facts: ['f'], literals: [['KEY']], lead: [] },
  { id: 'b', context: 'C', question: 'Q', facts: ['f'], literals: [], lead: [] },
];
const verdictLines = (input) => [...input.matchAll(/^Fact (\d+):/gm)].map((m) => `${m[1]}: PASS`).join('\n');
const pass = async ({ input }) => verdictLines(input);
const sized = (n) => `KEY${' w'.repeat(n - 1)}`;
const withReplies = (n) => ({ replies: [sized(n)], mean: 5000 });
const baseline = { a: withReplies(100), b: withReplies(200) };
const storedRow = (id, replies) => ({ id, replies, tokens: 77, baselineTokens: 5000, ratio: 1, failed: [], runs: [] });

test('dry run adds the judge share: the newest finished log rate, else 0.4 of the reply cost', () => {
  const priced = { a: { ...withReplies(100), replies: ['x', 'y', 'z'], cost: 0.3 }, b: { ...withReplies(100), replies: ['x', 'y', 'z'], cost: 0.6 } };
  assert.ok(Math.abs(projectDryRun({ cases, baseline: priced, runs: 2 }).projectedUsd - 0.6 * 1.4) < 1e-9);
  assert.ok(Math.abs(projectDryRun({ cases, baseline: priced, runs: 2, judgePerReply: 0.05 }).projectedUsd - (0.6 + 0.2)) < 1e-9);
});

test('judgeRate reads the newest finished log and skips a partial one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const write = (name, log) => fs.writeFileSync(path.join(dir, name), JSON.stringify(log));
  try {
    assert.equal(judgeRate(dir), null);
    write('1.json', { judge_cost_usd: 9, perCase: [storedRow('a', ['x', 'y'])] });
    write('2.json', { judge_cost_usd: 0.3, perCase: [storedRow('a', ['x', 'y', 'z']), storedRow('b', ['x', 'y', 'z'])] });
    write('3.json', { partial: true, judge_cost_usd: 99, perCase: [storedRow('a', ['x'])] });
    assert.ok(Math.abs(judgeRate(dir) - 0.05) < 1e-9);
    write('4.json', { perCase: [storedRow('a', ['x'])] });
    assert.equal(judgeRate(dir), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function captureOutput(run) {
  const written = { stdout: '', stderr: '' };
  const originals = { stdout: process.stdout.write, stderr: process.stderr.write };
  process.stdout.write = (chunk) => { written.stdout += chunk; return true; };
  process.stderr.write = (chunk) => { written.stderr += chunk; return true; };
  try {
    run();
  } finally {
    process.stdout.write = originals.stdout;
    process.stderr.write = originals.stderr;
  }
  return written;
}

const dryRunOf = (cost) => captureOutput(() => runDryRun({ ...parseArgs(['--dry-run', '--runs', '1']), logDir: os.tmpdir() }, cases, { a: { ...withReplies(100), replies: ['x'], cost }, b: { ...withReplies(200), replies: ['x'], cost } }));

test('a dry run over --max-usd prints the projection and an over-budget line without failing', () => {
  const written = dryRunOf(2);
  assert.equal(JSON.parse(written.stdout).cells, 2);
  assert.match(written.stderr, /projected_usd=5\.6000 over --max-usd 3/);
});

test('a dry run under --max-usd prints the power line and no over-budget line', () => {
  const { stderr } = dryRunOf(0.1);
  assert.match(stderr, /^power: 2 tasks x 1 samples x 1 arms = 2 runs; .*\n$/);
  assert.doesNotMatch(stderr, /over --max-usd/);
});

test('a paid run still fails once spend passes --max-usd', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-adhd-log-'));
  const reply = async () => ({ text: sized(50), tokens: 5000, cost: 0.02 });
  try {
    await assert.rejects(runScore({ opts: { ...parseArgs(['--runs', '1', '--max-usd', '0.01']), logDir: dir }, cases, reply, judge: pass, spend: new Spend(0.01), baseline }), /passed --max-usd 0\.01/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('--concise-baseline gets the baseline cap, and --max-usd overrides it', () => {
  assert.equal(parseArgs(['--concise-baseline']).maxUsd, 4);
  assert.equal(parseArgs(['--concise-baseline', '--max-usd', '1']).maxUsd, 1);
});

test('--arm caveman keeps the quick cap and --max-usd overrides it', () => {
  assert.equal(parseArgs(['--arm', 'caveman']).maxUsd, 0.3);
  assert.equal(parseArgs(['--arm', 'caveman', '--max-usd', '0.5']).maxUsd, 0.5);
});

test('the score carries a case-clustered SE and a baseline verdict that needs the interval to clear 1', async () => {
  const { baselineVerdict, quickIntervalLine, scoreIntervalLine } = await import('../benchmarks/adhd-score.mjs');
  assert.equal(baselineVerdict({ lo: 0.7, hi: 0.9 }), 'shorter');
  assert.equal(baselineVerdict({ lo: 1.1, hi: 1.4 }), 'longer');
  assert.equal(baselineVerdict({ lo: 0.8, hi: 1.2 }), 'noise');
  assert.equal(baselineVerdict({ lo: null, hi: null }), 'no SE');
  assert.match(scoreIntervalLine({ perCase: [{}, {}], scoreSe: 0.05, scoreLo: 0.6, scoreHi: 0.8 }), /^score_se=0\.050 score_ci95=0\.600\.\.0\.800 clusters=2 vs_baseline=shorter\n$/);
  assert.match(scoreIntervalLine({ perCase: [{}], scoreSe: null, scoreLo: null, scoreHi: null }), /vs_baseline=no SE/);
  assert.match(quickIntervalLine([{ ratio: 0.5 }]), /no SE \(n=1\) vs_baseline=no SE/);
  assert.match(quickIntervalLine([{ ratio: 0.5 }, { ratio: 0.6 }, { ratio: 0.55 }]), /vs_baseline=shorter/);
});
