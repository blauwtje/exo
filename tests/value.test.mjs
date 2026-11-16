import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { armFigures, planBudget, readRows, unmeasuredParts } from '../evals/value.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const table = fs.readFileSync(path.join(root, 'evals', 'value.md'), 'utf8');

test('the plan assigns every case to one part and orders parts by share', () => {
  const output = execFileSync('node', [path.join(root, 'evals', 'value.mjs'), '--plan'], { encoding: 'utf8' });
  assert.match(output, /^adhd share 1\.90 measured/);
});

test('parts whose share exceeds what is left are not measured', () => {
  const steps = planBudget(readRows(table));
  assert.deepEqual(steps.filter((step) => !step.fits).map((step) => step.part), []);
});

test('a run the cost cap skipped is not counted as passed or failed', () => {
  const run = (passed, skippedPaidGraders) => ({ passed, costUsd: 1, judgeCostUsd: 0.5, skippedPaidGraders });
  const cases = [
    { arms: { with: { a: run(true, false), b: run(false, true), c: run(false, true) }, without: { a: run(false, true) } } },
  ];
  assert.deepEqual(armFigures(cases, 'with'), { passed: 1, cost: 4.5 });
  assert.deepEqual(armFigures(cases, 'without'), { passed: '-', cost: 1.5 });
});

test('a part with a dated row but a missing figure is still picked to measure', () => {
  const rows = readRows(table).map((row) => ({ ...row, with: '1', without: '1', 'cost with': '1', 'cost without': '1', date: '2026-01-01' }));
  rows[0] = { ...rows[0], without: '-' };
  assert.deepEqual(unmeasuredParts(rows), [rows[0].part]);
});
