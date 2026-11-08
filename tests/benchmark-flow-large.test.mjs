import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { selectCells, sweepCells } from '../benchmarks/sweep-cells.mjs';
import { FLOW_HELPERS, flowPlanText } from '../benchmarks/sweep-fixtures.mjs';
import { FLOW_LARGE_EXTRA } from '../benchmarks/sweep-large.mjs';

const FLOW_LARGE_HELPERS = [...FLOW_HELPERS, ...FLOW_LARGE_EXTRA];
const steps = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'benchmarks', 'cell-steps.json'), 'utf8'));

test('flow-large is a flow-large cell that only the full tier selects', () => {
  const cells = sweepCells();
  const large = cells.find((cell) => cell.id === 'flow-large');
  assert.equal(large.kind, 'flow-large');
  assert.ok(!selectCells(cells, ['flow']).some((cell) => cell.id === 'flow-large'));
  assert.ok(selectCells(cells, ['all']).some((cell) => cell.id === 'flow-large'));
});

test('flow-large plans more than four build tasks and cell-steps.json agrees', () => {
  assert.ok(FLOW_LARGE_HELPERS.length > 4);
  assert.equal(steps['flow-large']['build-task'], FLOW_LARGE_HELPERS.length);
  const text = flowPlanText('/repo', true, FLOW_LARGE_HELPERS);
  assert.equal(text.match(/^### Task \d+:/gm).length, FLOW_LARGE_HELPERS.length);
  assert.ok(text.includes('`reverseWords`'));
  assert.ok(text.includes('The six tasks are independent: no module imports another.'));
});

test('the default plan keeps its four tasks', () => {
  const text = flowPlanText('/repo', true);
  assert.equal(text.match(/^### Task \d+:/gm).length, FLOW_HELPERS.length);
  assert.ok(text.includes('`titleCase`, `slugify`, `truncate` and `initials`'));
  assert.ok(text.includes('The four tasks are independent: no module imports another.'));
});

test('a flow-large cell is scored against its own six tasks', async () => {
  const { checkFlow } = await import('../benchmarks/flow-check.mjs');
  const { flowHelpers } = await import('../benchmarks/sweep-prepare.mjs');
  const { tempDir, git } = await import('./harness.mjs');
  const repo = tempDir('flow-large-score');
  git(repo, 'init', '-q');
  const large = flowHelpers({ kind: 'flow-large' });
  assert.equal(large.length, FLOW_LARGE_HELPERS.length);
  assert.equal(checkFlow(repo, large).total, 6);
  assert.equal(checkFlow(repo).total, FLOW_HELPERS.length);
});
