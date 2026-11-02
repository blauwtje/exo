import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plannedPowerLine, scoresByTask } from '../benchmarks/power-plan.mjs';
import { powerLine } from '../lib/eval-stats.mjs';

test('scoresByTask groups numeric scores by task and skips unusable rows', () => {
  const rows = [{ id: 'a', pass: 1 }, { id: 'a', pass: 0 }, { id: 'b', pass: 1 }, { id: null, pass: 1 }, { id: 'c', pass: 'x' }];
  assert.deepEqual(scoresByTask(rows, { task: (row) => row.id, score: (row) => row.pass }), { a: [1, 0], b: [1] });
});

test('without recorded scores the line uses the pass-rate default', () => {
  assert.equal(plannedPowerLine({ tasks: 12, samples: 3, arms: 2 }), powerLine({ tasks: 12, samples: 3, arms: 2 }));
});

test('fewer than two recorded tasks fall back to the pass-rate default', () => {
  assert.equal(plannedPowerLine({ tasks: 4, recorded: { a: [1, 0] } }), powerLine({ tasks: 4, arms: 1 }));
});

test('recorded scores that are all equal fall back to the pass-rate default', () => {
  assert.equal(plannedPowerLine({ tasks: 4, recorded: { a: [1, 1], b: [1, 1] } }), powerLine({ tasks: 4, arms: 1 }));
});

test('two recorded tasks give their variance to the line', () => {
  const recorded = { a: [1, 1, 1], b: [0, 0, 0], c: [1, 0, 1] };
  const line = plannedPowerLine({ tasks: 6, samples: 3, arms: 2, recorded });
  assert.equal(line, powerLine({ tasks: 6, samples: 3, arms: 2, scores: { base: recorded, candidate: recorded } }));
  assert.notEqual(line, powerLine({ tasks: 6, samples: 3, arms: 2 }));
});

test('no planned task prints a plain note instead of throwing', () => {
  assert.equal(plannedPowerLine({ tasks: 0 }), 'power: no task planned');
});

test('the line names its task count, samples, arms and runs', () => {
  assert.match(plannedPowerLine({ tasks: 5, samples: 2, arms: 3 }), /^power: 5 tasks x 2 samples x 3 arms = 30 runs;/);
});
