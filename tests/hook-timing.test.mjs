import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CASES, extraMilliseconds, median, timeCase, verdictFor } from '../benchmarks/hook-timing.mjs';

test('median extra is the difference of the sample medians', () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(extraMilliseconds([10, 12, 14], [4, 5, 6]), 7);
});

test('verdict is KEEP when every extra is under the limit', () => {
  assert.equal(verdictFor([10, 74.9], 75), 'KEEP');
});

test('verdict is DISCARD when any extra reaches the limit', () => {
  assert.equal(verdictFor([10, 75], 75), 'DISCARD');
  assert.equal(verdictFor([120, 5], 75), 'DISCARD');
});

test('each case spawns its hook and returns a number', () => {
  for (const timing of CASES) assert.equal(Number.isFinite(timeCase(timing, 3)), true);
});

test('a case times the worker-count file read by the orchestrator Bash step', () => {
  const timing = CASES.find((entry) => entry.name === 'worker count read');
  assert.equal(timing.script, 'dispatch-bash.mjs');
  assert.equal(timing.with.agent_type, 'orchestrator');
  assert.equal(timing.without.agent_id, undefined);
});
