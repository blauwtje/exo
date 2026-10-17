import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { projectCost, projectTime } from '../benchmarks/value.mjs';

function writeCell(runs, run, { meta, cost, wallMs }) {
  const cell = path.join(runs, run, 'task-a', 'exo', '1');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(runs, run, 'meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify({ task: 'task-a', arm: 'exo', model: 'm', wallMs }));
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
}

test('projectCost matches past cells on effort and counts fallbacks', () => {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-runs-'));
  writeCell(runs, 'low', { meta: { effort: 'low' }, cost: 1 });
  writeCell(runs, 'max', { meta: { effort: 'max' }, cost: 5 });
  writeCell(runs, 'old', { meta: {}, cost: 100 });
  const cells = [{ task: { id: 'task-a', estimateUsd: 2 }, arm: 'exo', modelId: 'm' }];
  assert.equal(projectCost(cells, runs, 'low').total, 1);
  assert.equal(projectCost(cells, runs, 'max').total, 5);
  const other = projectCost(cells, runs, 'high');
  assert.equal(other.total, 2);
  assert.equal(other.fromFallback, 1);
  assert.equal(projectCost(cells, runs, 'low').fromFallback, 0);
});

test('projectTime sums past mean wallMs at the same effort and counts unknown cells', () => {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-runs-'));
  writeCell(runs, 'low', { meta: { effort: 'low' }, cost: 1, wallMs: 60000 });
  writeCell(runs, 'max', { meta: { effort: 'max' }, cost: 5, wallMs: 300000 });
  const cells = [{ task: { id: 'task-a' }, arm: 'exo', modelId: 'm' }];
  assert.deepEqual(projectTime(cells, runs, 'low'), { totalMs: 60000, fromRuns: 1, unknown: 0 });
  assert.equal(projectTime(cells, runs, 'max').totalMs, 300000);
  const other = projectTime(cells, runs, 'high');
  assert.equal(other.totalMs, 0);
  assert.equal(other.unknown, 1);
});
