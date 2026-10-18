import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { compareMeans, nextRuns } from '../benchmarks/statistics.mjs';

const SCORE = path.join(import.meta.dirname, '..', 'benchmarks', 'score.mjs');
const USAGE = { counts: { weightedInput: 1000, output: 500 }, subagents: [] };
const TIMES = [60000, 66000, 54000];

function writeCell(runs, { task = 't', arm, run, cost, wallMs = 60000, pass = true, tier = 'value', harnessError }) {
  const cell = path.join(runs, task, arm, String(run));
  fs.mkdirSync(cell, { recursive: true });
  const checks = harnessError === undefined
    ? { tier, pass, defects: 0, loc: { added: 5 }, wallMs }
    : { tier, harnessError, pass: false, defects: 0, loc: { added: 5 }, wallMs };
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify(checks));
  if (cost !== null) fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
  fs.writeFileSync(path.join(cell, 'usage.json'), JSON.stringify(USAGE));
}

function makeRun(cells) {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-compare-'));
  const meta = {
    model: 'm', claudeVersion: '1', fixture: { name: 'f', commit: 'c' }, runs: 3, date: '2026-01-01',
    arms: ['exo-before', 'exo'], tasks: ['t'], cells: cells.length, mode: 'x'
  };
  fs.writeFileSync(path.join(runs, 'meta.json'), JSON.stringify(meta));
  cells.forEach((cell, index) => writeCell(runs, { run: index + 1, ...cell }));
  return runs;
}

// Three cells per arm; `after.pass` lets one after cell fail.
function arms(before, after, times = TIMES) {
  return [
    ...before.map((cost, index) => ({ arm: 'exo-before', cost, wallMs: times[index] })),
    ...after.map((cost, index) => ({ arm: 'exo', cost, wallMs: times[index], pass: index !== 0 }))
  ];
}

function compare(cells, args = ['--compare', 'exo-before,exo']) {
  const runs = makeRun(cells);
  return spawnSync(process.execPath, [SCORE, runs, ...args], { encoding: 'utf8' });
}

const BEFORE = [0.8, 1.0, 1.2];
const AFTER = [1.3, 1.5, 1.7];
const TIME_ROW = '| t | time | 3 | 3 | 60.0 s ±3.5 s | 60.0 s ±3.5 s | +0.0 s | +0% | 9.8 s | noise |';

test('P1 compareMeans reads a rise', () => {
  const result = compareMeans(BEFORE, AFTER);
  assert.ok(Math.abs(result.diff - 0.5) < 1e-9);
  assert.ok(Math.abs(result.twoSeDiff - 0.326599) < 1e-6);
  assert.equal(result.verdict, 'rise');
});

test('P2 swapped arguments read a fall', () => {
  const result = compareMeans(AFTER, BEFORE);
  assert.ok(Math.abs(result.diff + 0.5) < 1e-9);
  assert.equal(result.verdict, 'fall');
});

test('P3 a small difference is noise', () => {
  const result = compareMeans(BEFORE, [0.9, 1.1, 1.3]);
  assert.ok(Math.abs(result.diff - 0.1) < 1e-9);
  assert.equal(result.verdict, 'noise');
});

test('P4 one value in an arm has no SE', () => {
  const result = compareMeans([1], [2]);
  assert.equal(result.twoSeDiff, null);
  assert.equal(result.verdict, 'no SE');
  assert.equal(result.diff, 1);
});

test('P5 equal constant arms are noise at SE 0', () => {
  const result = compareMeans([1, 1], [1, 1]);
  assert.equal(result.twoSeDiff, 0);
  assert.equal(result.verdict, 'noise');
});

test('P6 nextRuns sizes n from the CV, capped and floored', () => {
  assert.equal(nextRuns(0.2), 8);
  assert.equal(nextRuns(0.25), 12);
  assert.equal(nextRuns(0.35), 22);
  assert.equal(nextRuns(0.5), 22);
  assert.equal(nextRuns(0.05), 2);
  assert.equal(nextRuns(null), 12);
  assert.equal(nextRuns(0), 12);
});

test('C1 rise prints both rows, CV line and verdict', () => {
  const output = compare(arms(BEFORE, AFTER));
  assert.equal(output.status, 0, output.stderr);
  const lines = output.stdout.split('\n');
  assert.equal(lines[0], 'compare exo-before → exo · value tier · model m · 2026-01-01 · mean ±standard error');
  assert.ok(lines.includes('| t | cost | 3 | 3 | $1.0000 ±$0.1155 | $1.5000 ±$0.1155 | +$0.5000 | +50% | $0.3266 | rise |'));
  assert.ok(lines.includes(TIME_ROW));
  assert.ok(lines.includes('t: CV 0.20 (largest of cost and time, both arms) · next n 8'));
  assert.ok(lines.includes('verdict: rise'));
});

test('C2 fall', () => {
  const output = compare(arms(AFTER, BEFORE));
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /\| -\$0\.5000 \| -33% \| \$0\.3266 \| fall \|/);
  assert.match(output.stdout, /verdict: fall/);
  assert.match(output.stdout, /next n 8\n/);
});

test('C3 noise', () => {
  const output = compare(arms(BEFORE, [0.9, 1.1, 1.3]));
  assert.match(output.stdout, /\| \+\$0\.1000 \| \+10% \| \$0\.3266 \| noise \|/);
  assert.match(output.stdout, /verdict: noise/);
});

test('C4 a noisy task is capped at 22 runs', () => {
  const output = compare(arms([0.5, 1.0, 1.5], [0.5, 1.0, 1.5]));
  assert.match(output.stdout, /t: CV 0\.50 .* next n 22\n/);
});

test('C5 one cell per arm has no verdict and uses the planning CV', () => {
  const output = compare([{ arm: 'exo-before', cost: 1 }, { arm: 'exo', cost: 2 }]);
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /\$1\.0000 \(n=1\)/);
  assert.match(output.stdout, /\| - \| no SE \|/);
  assert.match(output.stdout, /verdict: no verdict/);
  assert.match(output.stdout, /next n 12 \(planning CV 0\.25\)/);
});

test('C6 harness errors and missing results drop out of the right metric', () => {
  const cells = [
    ...arms(BEFORE, AFTER),
    { arm: 'exo-before', cost: 99, harnessError: 'x' },
    { arm: 'exo', cost: null, wallMs: 60000 }
  ];
  const output = compare(cells);
  assert.equal(output.status, 0, output.stderr);
  assert.match(output.stdout, /\| t \| cost \| 3 \| 3 \|.*\+\$0\.5000 /);
  assert.match(output.stdout, /\| t \| time \| 3 \| 4 \|/);
});

test('C7 bad input exits 1 with its message', () => {
  const usage = 'score: usage: score.mjs <runs directory> --compare <before-arm>,<after-arm>';
  const good = arms(BEFORE, AFTER);
  const cases = [
    [good, ['--compare', 'exo'], usage],
    [good, ['--compare', 'exo,exo'], usage],
    [good, ['--compare', 'exo-before,missing'], /score: arm missing has no cells in /],
    [[...good, { arm: 'exo', cost: 1, tier: 'template' }], ['--compare', 'exo-before,exo'], /score: --compare reads value cells only; t\/exo\/7 is template/],
    [good, ['--compare', 'exo-before,exo', '--publish'], 'score: --compare takes one value run directory and does not publish']
  ];
  for (const [cells, args, expected] of cases) {
    const output = compare(cells, args);
    assert.equal(output.status, 1, args.join(' '));
    if (typeof expected === 'string') assert.equal(output.stderr.trim(), expected);
    else assert.match(output.stderr, expected);
  }
});

test('C8 a task with one arm only is refused', () => {
  const output = compare([...arms(BEFORE, AFTER), { task: 'u', arm: 'exo', cost: 1 }]);
  assert.equal(output.status, 1);
  assert.match(output.stderr, /score: task u has no exo-before cells/);
});
