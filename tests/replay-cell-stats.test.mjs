import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { FULL_RUNS, QUICK_RUNS, parseFlags } from '../benchmarks/replay/runner.mjs';
import { cellRecord, compareArms, failureRate, formatMeasure, isAborted, measure, readCellRecord, stoppedRecord, summaryLines } from '../benchmarks/replay/cell-stats.mjs';

const RUNNER = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'benchmarks', 'replay', 'runner.mjs');
const finished = { total_cost_usd: 0.5, wallMs: 4000, exitCode: 0 };
const cell = (caseId, grade, result = finished) => cellRecord({ caseId, kind: 'k', grade, result });

test('a timed out, errored or non-zero exit result is aborted', () => {
  assert.equal(isAborted({ timedOut: true }), true);
  assert.equal(isAborted({ is_error: true }), true);
  assert.equal(isAborted({ exitCode: null }), true);
  assert.equal(isAborted(finished), false);
});

test('a missing cost stays null, never zero', () => {
  assert.equal(cell('a', 'pass', { wallMs: 1 }).costUsd, null);
});

test('measure leaves unknown values out and counts them', () => {
  const stat = measure([1, 3, null, undefined]);
  assert.equal(stat.mean, 2);
  assert.equal(stat.n, 2);
  assert.equal(stat.excluded, 2);
  assert.notEqual(stat.se, null);
});

test('one value prints no SE', () => {
  assert.match(formatMeasure(measure([1])), /no SE n 1 excluded 0/);
  assert.match(formatMeasure(measure([null])), /n\/a n 0 excluded 1/);
});

test('aborted, stopped, unknown and leak cells count as failures in the fail rate', () => {
  const cells = [cell('a', 'pass'), cell('a', 'pass', { timedOut: true }), stoppedRecord({ caseId: 'a', kind: 'k' }), cell('a', 'unknown'), cell('a', 'leak'), cell('a', 'fail')];
  assert.equal(failureRate(cells).mean, 5 / 6);
});

test('cost and wall means leave aborted cells out and print the excluded count', () => {
  const cells = [cell('a', 'pass'), cell('a', 'pass', { ...finished, total_cost_usd: 1.5 }), cell('a', 'fail', { timedOut: true, total_cost_usd: 9, wallMs: 99000 })];
  const lines = summaryLines({ cells });
  assert.match(lines.find((line) => line.startsWith('cost usd')), /1\.000 se 0\.500 n 2 excluded 1/);
  assert.match(lines.find((line) => line.startsWith('wall s')), /4\.0 se 0\.0 n 2 excluded 1/);
});

test('a single cell per case prints the per-case rate without SE', () => {
  const lines = summaryLines({ cells: [cell('a', 'pass')] });
  assert.match(lines[0], /fail rate 0\.000 no SE n 1 excluded 0/);
});

test('arms compare paired per shared case with a verdict only when the interval clears zero', () => {
  const base = ['a', 'b', 'c', 'd'].flatMap((id) => [cell(id, 'pass'), cell(id, 'pass')]);
  const worse = ['a', 'b', 'c', 'd'].flatMap((id, index) => [cell(id, 'fail'), cell(id, index === 0 ? 'pass' : 'fail')]);
  assert.equal(compareArms({ base, candidate: worse }).verdict, 'worse');
  const mixed = [cell('a', 'fail'), cell('b', 'pass'), cell('c', 'fail'), cell('d', 'pass')];
  assert.equal(compareArms({ base, candidate: mixed }).verdict, 'noise');
});

test('one shared case gives no SE and no verdict', () => {
  const comparison = compareArms({ base: [cell('a', 'pass')], candidate: [cell('a', 'fail')] });
  assert.equal(comparison.verdict, 'no SE');
  assert.equal(comparison.se, null);
});

test('cases only one arm ran are not paired', () => {
  assert.equal(compareArms({ base: [cell('a', 'pass')], candidate: [cell('b', 'fail')] }), null);
});

test('the summary prints the comparison line against another arm', () => {
  const lines = summaryLines({ cells: [cell('a', 'fail'), cell('b', 'fail')], others: { baseline: [cell('a', 'pass'), cell('b', 'pass')] } });
  assert.match(lines.at(-1), /^vs baseline\tfail rate diff 1\.000 /);
});

test('readCellRecord reads grade and result, and skips a cell with no grade', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cell-stats-'));
  assert.equal(readCellRecord(directory, 'a', 'k'), null);
  fs.writeFileSync(path.join(directory, 'grade.json'), JSON.stringify({ grade: 'pass' }));
  assert.equal(readCellRecord(directory, 'a', 'k').aborted, true);
  fs.writeFileSync(path.join(directory, 'result.json'), JSON.stringify(finished));
  assert.deepEqual(readCellRecord(directory, 'a', 'k'), { caseId: 'a', kind: 'k', grade: 'pass', aborted: false, costUsd: 0.5, wallMs: 4000 });
});

test('runner flags default to the quick tier', () => {
  const flags = parseFlags(['--cases', 'a', '--out', 'x']);
  assert.equal(flags.tier, 'quick');
  assert.equal(flags.runs, QUICK_RUNS);
});

test('runner --full runs the full tier and --runs is custom', () => {
  assert.equal(parseFlags(['--cases', 'a', '--out', 'x', '--full']).runs, FULL_RUNS);
  const custom = parseFlags(['--cases', 'a', '--out', 'x', '--runs', '3']);
  assert.equal(custom.tier, 'custom');
  assert.equal(custom.runs, 3);
});

test('runner --full with --runs is an error', () => {
  assert.throws(() => parseFlags(['--cases', 'a', '--out', 'x', '--full', '--runs', '2']), /exclude each other/);
});

test('runner --dry-run prints the quick plan and exits 0', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-dry-'));
  const cases = fs.readdirSync(path.join(path.dirname(RUNNER), 'cases'))[0];
  const result = spawnSync(process.execPath, [RUNNER, '--cases', cases, '--out', out, '--dry-run'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /quick tier, 1 cells/);
});
