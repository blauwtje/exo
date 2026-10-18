import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { renderReport } from '../benchmarks/tbench/readouts.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

test('C1 README describes the watcher running-trial charge as the highest finished cost', () => {
  assert.doesNotMatch(read('benchmarks/README.md'), /plus \$1\.5 \(`--running`\) per running trial/);
});

test('C2 a missing agent or setup wall span prints n/a', () => {
  const report = renderReport([{ task: 't', arm: 'a', pass: true, cost: 1, wallMs: 1, setupMs: null }]);
  assert.match(report, /n\/a/);
});

test('C3 watch.mjs carries no comment calling the running charge flat', () => {
  assert.doesNotMatch(read('benchmarks/tbench/watch.mjs'), /a flat charge per running trial/);
});

test('C4 budgets.mjs comment does not cite the old 760 spec ceiling', () => {
  assert.doesNotMatch(read('verify/budgets.mjs'), /measured 760/);
});
