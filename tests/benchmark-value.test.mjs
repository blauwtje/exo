import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { projectCost } from '../benchmarks/value.mjs';

function writeCell(runs, run, meta, cost) {
  const cell = path.join(runs, run, 'task-a', 'exo', '1');
  fs.mkdirSync(cell, { recursive: true });
  fs.writeFileSync(path.join(runs, run, 'meta.json'), JSON.stringify(meta));
  fs.writeFileSync(path.join(cell, 'checks.json'), JSON.stringify({ task: 'task-a', arm: 'exo', model: 'm' }));
  fs.writeFileSync(path.join(cell, 'result.json'), JSON.stringify({ total_cost_usd: cost }));
}

test('projectCost matches past cells on effort and counts fallbacks', () => {
  const runs = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-runs-'));
  writeCell(runs, 'low', { effort: 'low' }, 1);
  writeCell(runs, 'max', { effort: 'max' }, 5);
  writeCell(runs, 'old', {}, 100);
  const cells = [{ task: { id: 'task-a', estimateUsd: 2 }, arm: 'exo', modelId: 'm' }];
  assert.equal(projectCost(cells, runs, 'low').total, 1);
  assert.equal(projectCost(cells, runs, 'max').total, 5);
  const other = projectCost(cells, runs, 'high');
  assert.equal(other.total, 2);
  assert.equal(other.fromFallback, 1);
  assert.equal(projectCost(cells, runs, 'low').fromFallback, 0);
});
