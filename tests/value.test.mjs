import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { planBudget, readRows } from '../evals/value.mjs';

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
