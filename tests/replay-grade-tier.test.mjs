import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { QUICK_CELLS, QUICK_VOTES, parseGradeArguments, planGrade, selectCells, summaryLines, voteStability } from '../benchmarks/replay/grade.mjs';
import { tempDir } from './harness.mjs';

const GRADE = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'benchmarks', 'replay', 'grade.mjs');

function makeRun(cells) {
  const run = tempDir('grade-tier-');
  cells.forEach(({ name, type, output, prior }) => {
    const cell = path.join(run, name);
    fs.mkdirSync(cell);
    const grade = type === 'rubric' ? { type, rubric: 'r' } : { type, fail: ['bad'] };
    fs.writeFileSync(path.join(cell, 'case.json'), JSON.stringify({ grade }));
    fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ result: output }));
    if (prior) fs.writeFileSync(path.join(cell, 'grade.json'), JSON.stringify(prior));
  });
  return run;
}

const rubricCells = (count) => Array.from({ length: count }, (_, index) => ({ name: `c${index}`, type: 'rubric', output: 'text' }));

test('parseGradeArguments defaults to the quick tier', () => {
  assert.deepEqual(parseGradeArguments(['dir']), { target: 'dir', dryRun: false, full: false });
});

test('parseGradeArguments reads --dry-run and --full in any position', () => {
  assert.deepEqual(parseGradeArguments(['--full', 'dir', '--dry-run']), { target: 'dir', dryRun: true, full: true });
});

test('parseGradeArguments rejects a missing target and unknown flags', () => {
  assert.throws(() => parseGradeArguments([]), /usage/);
  assert.throws(() => parseGradeArguments(['dir', '--bogus']), /unknown flag/);
});

test('selectCells keeps the first QUICK_CELLS cells unless full', () => {
  const cells = ['a', 'b', 'c', 'd', 'e'];
  assert.equal(QUICK_CELLS, 3);
  assert.deepEqual(selectCells(cells, { full: false }), ['a', 'b', 'c']);
  assert.deepEqual(selectCells(cells, { full: true }), cells);
});

test('planGrade counts judge calls for rubric cells only, skipping leaks and empty output', () => {
  const run = makeRun([
    { name: 'a', type: 'rubric', output: 'text' },
    { name: 'b', type: 'regex', output: 'text' },
    { name: 'c', type: 'rubric', output: '' },
    { name: 'd', type: 'rubric', output: 'text', prior: { grade: 'leak' } },
    { name: 'e', type: 'rubric', output: 'text' }
  ]);
  const names = ['a', 'b', 'c', 'd', 'e'].map((name) => path.join(run, name));
  assert.equal(planGrade(names, { votes: 3 }).judgedCells, 2);
  assert.equal(planGrade(names, { votes: 3 }).calls, 6);
  assert.equal(planGrade(names, { votes: QUICK_VOTES }).calls, 2);
});

test('--dry-run prints the plan, spends nothing and writes no grade.json', () => {
  const run = makeRun(rubricCells(5));
  const result = spawnSync(process.execPath, [GRADE, run, '--dry-run'], { encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quick tier/);
  assert.match(result.stdout, /3 cells/);
  assert.match(result.stdout, /3 judge calls/);
  assert.match(result.stdout, /\$/);
  assert.equal(fs.existsSync(path.join(run, 'c0', 'grade.json')), false);
});

test('--full --dry-run plans every cell with three votes each', () => {
  const run = makeRun(rubricCells(5));
  const result = spawnSync(process.execPath, [GRADE, run, '--full', '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /full tier/);
  assert.match(result.stdout, /5 cells/);
  assert.match(result.stdout, /15 judge calls/);
});

test('a usage error exits 2', () => {
  const result = spawnSync(process.execPath, [GRADE], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /usage/);
});

test('voteStability is the share of valid votes behind the winner, null with none', () => {
  assert.equal(voteStability(2, 1), 2 / 3);
  assert.equal(voteStability(3, 0), 1);
  assert.equal(voteStability(0, 0), null);
});

test('summaryLines prints the pass rate with SE and the vote stability and cost with excluded counts', () => {
  const graded = [
    { grade: 'pass', votes: ['pass', 'pass', 'pass'], stability: 1, judgeCostUsd: 0.02 },
    { grade: 'fail', votes: ['fail', 'pass', 'fail'], stability: 2 / 3, judgeCostUsd: null },
    { grade: 'unknown', votes: ['unknown', 'unknown', 'unknown'], stability: null, judgeCostUsd: 0.04 }
  ];
  const lines = summaryLines(graded);
  assert.match(lines[0], /^pass rate 0\.333 se 0\.333 n 3 excluded 0/);
  assert.match(lines[1], /vote stability 0\.833 se 0\.167 n 2 excluded 1 unanimous 1\/3 votes per cell 3/);
  assert.match(lines[2], /judge cost usd per judged cell 0\.030 se 0\.010 n 2 excluded 1/);
});

test('a single graded cell prints no SE', () => {
  assert.match(summaryLines([{ grade: 'pass' }])[0], /pass rate 1\.000 no SE n 1/);
  assert.equal(summaryLines([{ grade: 'pass' }]).length, 1);
  assert.deepEqual(summaryLines([]), []);
});
