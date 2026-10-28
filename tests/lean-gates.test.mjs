import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectedCostLine, recordedRunCosts } from '../benchmarks/lean-gates.mjs';

function savedRun(out, name, stdout) {
  mkdirSync(join(out, name), { recursive: true });
  if (stdout !== undefined) writeFileSync(join(out, name, 'stdout.json'), stdout);
}

test('recordedRunCosts reads total_cost_usd of each saved run and skips probes, unreadable and costless runs', () => {
  const out = mkdtempSync(join(tmpdir(), 'lean-gates-costs-'));
  savedRun(out, '01-old', JSON.stringify({ total_cost_usd: 12 }));
  savedRun(out, '02-old', JSON.stringify({ total_cost_usd: 20 }));
  savedRun(out, '03-new', JSON.stringify({ total_cost_usd: 30 }));
  savedRun(out, 'probe-old', JSON.stringify({ total_cost_usd: 0.1 }));
  savedRun(out, '04-new', '{not json');
  savedRun(out, '05-new', JSON.stringify({ result: 'no cost' }));
  savedRun(out, '06-new');
  assert.deepEqual(recordedRunCosts(out).sort((a, b) => a - b), [12, 20, 30]);
});

test('recordedRunCosts is empty for a missing out dir', () => {
  assert.deepEqual(recordedRunCosts(join(tmpdir(), 'lean-gates-no-such-dir')), []);
});

test('projectedCostLine prints the median recorded USD, else cost unknown', () => {
  assert.equal(projectedCostLine([12, 20, 30]), 'projected cost: $20.00 (median of 3 recorded runs)');
  assert.equal(projectedCostLine([10, 20]), 'projected cost: $15.00 (median of 2 recorded runs)');
  assert.equal(projectedCostLine([]), 'projected cost: cost unknown');
});
