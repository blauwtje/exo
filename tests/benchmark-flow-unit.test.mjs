import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { pluginVariants, sweepCells } from '../benchmarks/sweep-cells.mjs';
import { applyVariant } from '../benchmarks/variants.mjs';
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

test('flow-fold cell matches flow-unit except for its id and the fold-unit plugin variant', () => {
  const cells = sweepCells();
  const unit = cells.find((cell) => cell.id === 'flow-unit');
  const fold = cells.find((cell) => cell.id === 'flow-fold');
  assert.deepEqual({ ...fold, id: unit.id, pluginVariant: unit.pluginVariant }, unit);
  assert.equal(fold.pluginVariant, 'fold-unit');
  assert.ok(pluginVariants(cells).includes('fold-unit'));
});

test('fold-unit replaces the whole of step 5, bullets included, and keeps the build-task dispatch', () => {
  const root = path.join(import.meta.dirname, '..');
  const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'fold-unit-'));
  try {
    fs.cpSync(path.join(root, 'skills/build/references'), path.join(copy, 'skills/build/references'), { recursive: true });
    applyVariant('fold-unit', copy);
    const loop = fs.readFileSync(path.join(copy, 'skills/build/references/run-loop.md'), 'utf8');
    const step = loop.slice(loop.indexOf('5. **'), loop.indexOf('6. **'));
    assert.ok(!step.includes('Name plan path'));
    assert.ok(!step.includes('do not apply'));
    assert.ok(!step.includes('dispatching no agent'));
    assert.ok(step.includes('${CLAUDE_PLUGIN_ROOT}/agents/run-unit.md'));
    assert.ok(step.includes('`<skill>` = `${CLAUDE_SKILL_DIR}`'));
    assert.ok(step.includes('exo:build-task'));
    assert.ok(!step.includes('exo:run-unit'));
  } finally {
    fs.rmSync(copy, { recursive: true, force: true });
  }
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

test('compact flow plan states each helper behavior, and truncate counts its three dots toward max', () => {
  const text = flowPlanText('/repo', true);
  for (const helper of FLOW_HELPERS) {
    assert.equal(typeof helper.behavior, 'string', `${helper.title} has a behavior sentence`);
    assert.ok(text.includes(helper.behavior), `compact plan carries the behavior of ${helper.title}`);
  }
  assert.match(text, /max - 3 characters followed by three ASCII dots \(\.\.\.\)/);
  assert.match(text, /exactly max characters long/);
});
