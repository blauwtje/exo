import test from 'node:test';
import assert from 'node:assert/strict';
import { unsourcedFigures } from '../lib/evidence-rules.mjs';

test('flags a cost, count or wall figure with no source', () => {
  const report = ['Cost was $0.42 for the run', 'Wall 105 s', '3 cells passed'].join('\n');
  assert.deepEqual(unsourcedFigures(report), ['Cost was $0.42 for the run', 'Wall 105 s', '3 cells passed']);
});

test('accepts a figure beside a path or command', () => {
  const report = ['Cost $0.42 in .exo/karpathy/baseline.md', 'Wall 105 s from `node bench.mjs`', 'Done'].join('\n');
  assert.deepEqual(unsourcedFigures(report), []);
});
