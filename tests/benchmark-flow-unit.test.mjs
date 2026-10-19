import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { sweepCells } from '../benchmarks/sweep-cells.mjs';
import { FLOW_HELPERS, FLOW_PLAN, flowPlanText } from '../benchmarks/sweep-fixtures.mjs';

test('flow-unit cell sits beside flow-c7 and asks for the compact plan', () => {
  const cells = sweepCells();
  const unit = cells.find((cell) => cell.id === 'flow-unit');
  const c7 = cells.find((cell) => cell.id === 'flow-c7');
  assert.equal(unit.kind, 'flow');
  assert.equal(unit.compactPlan, true);
  assert.equal(unit.prompt, c7.prompt);
  assert.notEqual(c7.compactPlan, true);
});

test('compact flow plan has one field line per task, no code, and runs every task in parallel', () => {
  const text = flowPlanText('/repo', true);
  assert.ok(!text.includes('`'.repeat(3)), 'no code fence');
  assert.ok(text.includes('- Parallel: every task.'));
  const fieldLines = text.split('\n').filter((line) => line.startsWith('Depends on: none | Files:'));
  assert.equal(fieldLines.length, FLOW_HELPERS.length);
  for (const line of fieldLines) assert.match(line, / \| Data: .* \| Proof: node --test src\/[\w-]+\.test\.js$/);
  assert.ok(flowPlanText('/repo').includes('`'.repeat(3)), 'the default plan keeps its code');
});

test('sweep prepares the flow-unit repository with the compact plan', async () => {
  const { prepareRepository } = await import('../benchmarks/sweep.mjs');
  const cells = sweepCells();
  const plans = {};
  for (const id of ['flow-unit', 'flow-c7']) {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-unit-'));
    const repository = path.join(base, 'repo');
    fs.mkdirSync(repository);
    prepareRepository(cells.find((cell) => cell.id === id), repository, path.join(base, 'origin.git'));
    plans[id] = fs.readFileSync(path.join(repository, FLOW_PLAN), 'utf8');
    fs.rmSync(base, { recursive: true, force: true });
  }
  assert.ok(!plans['flow-unit'].includes('`'.repeat(3)), 'unit plan is compact');
  assert.ok(plans['flow-c7'].includes('`'.repeat(3)), 'c7 plan keeps its code');
});
