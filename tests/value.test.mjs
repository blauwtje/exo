import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armFigures, mergeRuns, needsThird, planBudget, readRows, regressions, settle, unmeasuredParts } from '../evals/value.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const table = fs.readFileSync(path.join(root, 'evals', 'value.md'), 'utf8');

test('the plan assigns every case to one part and orders parts by share', () => {
  const output = execFileSync('node', [path.join(root, 'evals', 'value.mjs'), '--plan'], { encoding: 'utf8' });
  assert.match(output, /^adhd share 1\.90 measured/);
});

test('parts whose share exceeds what is left are not measured', () => {
  const rows = ['a', 'b', 'c', 'd'].map((part, index) => ({ part, cases: `case-${part}`, share: '1.9', order: String(index + 1) }));
  const steps = planBudget(rows, 5);
  assert.deepEqual(steps.map((step) => step.fits), [true, true, false, false]);
});

test('a run the cost cap skipped counts as failed and is counted as cut', () => {
  const run = (passed, skippedPaidGraders) => ({ passed, costUsd: 1, judgeCostUsd: 0.5, skippedPaidGraders });
  const cases = [
    { arms: { with: { a: run(true, false), b: run(false, true), c: run(false, true) }, without: { a: run(false, true) } } },
  ];
  assert.deepEqual(armFigures(cases, 'with'), { passed: 0, cost: 4.5, cut: 2 });
  assert.deepEqual(armFigures(cases, 'without'), { passed: 0, cost: 1.5, cut: 1 });
});

test('a run without a cost makes the arm cost a dash', () => {
  assert.equal(armFigures([{ arms: { with: { a: { passed: true } } } }], 'with').cost, '-');
});

test('a part with a dated row but a missing figure is still picked to measure', () => {
  const rows = readRows(table).map((row) => ({ ...row, with: '1', without: '1', 'cost with': '1', 'cost without': '1', date: '2026-01-01' }));
  rows[0] = { ...rows[0], without: '-' };
  assert.deepEqual(unmeasuredParts(rows), [rows[0].part]);
});

test('a run without a cost counts as failed and cut', () => {
  assert.deepEqual(armFigures([{ arms: { with: { a: { passed: true } } } }], 'with'), { passed: 0, cost: '-', cut: 1 });
});

test('a 0 and 0 part with no recorded cost is not void', () => {
  const row = readRows(table)[0];
  const arm = { passed: 0, cost: '-', cut: 1 };
  assert.notEqual(settle(row, arm, arm).with, 'void');
});

test('a with figure that dropped between numbers is a regression, a void is not', () => {
  assert.deepEqual(regressions({ part: 'p', with: '1' }, { part: 'p', with: 0 }), ['regressed: p was 1, now 0']);
  assert.deepEqual(regressions({ part: 'p', with: 'void' }, { part: 'p', with: 0 }), []);
  assert.deepEqual(regressions({ part: 'p', with: '1' }, { part: 'p', with: 'void' }), []);
  assert.deepEqual(regressions({ part: 'p', with: '1' }, { part: 'p', with: 1 }), []);
});

const run = (passed, extra = {}) => ({ passed, costUsd: 1, ...extra });

test('two agreeing runs need no third, a split needs one, a cut run needs none', () => {
  assert.equal(needsThird({ arms: { with: { a: run(true), b: run(true) }, without: { a: run(false), b: run(false) } } }), false);
  assert.equal(needsThird({ arms: { with: { a: run(true), b: run(true) }, without: { a: run(true), b: run(false) } } }), true);
  assert.equal(needsThird({ arms: { with: { a: run(true), b: run(false, { skippedPaidGraders: true }) } } }), false);
});

test('a merged case holds three runs per arm and the majority decides', () => {
  const first = [{ name: 'adhd', arms: { with: { a: run(true), b: run(false) }, without: { a: run(false), b: run(false) } } }];
  const extra = [{ name: 'adhd', arms: { with: { a: run(true) }, without: { a: run(false) } } }];
  const merged = mergeRuns(first, extra);
  assert.equal(Object.keys(merged[0].arms.with).length, 3);
  assert.equal(Object.keys(merged[0].arms.without).length, 3);
  assert.equal(armFigures(merged, 'with').passed, 1);
});
