import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { readContract } from '../harnesses/coordination-contract.mjs';

const BASELINE = JSON.parse(fs.readFileSync('benchmarks/baselines/flow-unit-sweep.json', 'utf8'));
const MAIN_BUDGET_FLOOR = 30_000;

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

test('the baseline holds the 13 flow-unit records', () => {
  assert.equal(BASELINE.length, 13);
  assert.ok(BASELINE.every((run) => run.cell === 'flow-unit' && run.hopPeakTokens.main > 0));
});

test('each main contextBudget is the larger of 30000 and the baseline main peak', () => {
  const peak = median(BASELINE.map((run) => run.hopPeakTokens.main));
  const expected = Math.max(MAIN_BUDGET_FLOOR, peak);
  for (const [harness, rows] of Object.entries(readContract())) {
    assert.equal(rows.main.contextBudget, expected, harness);
  }
});
