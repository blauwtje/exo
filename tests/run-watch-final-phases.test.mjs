import assert from 'node:assert/strict';
import test from 'node:test';
import { FINAL_PHASES as hookPhases } from '../hooks/run-watch.mjs';
import { FINAL_PHASES as statePhases } from '../skills/build/scripts/run-state.mjs';

test('the hook copy of the final run phases equals run-state', () => {
  assert.deepStrictEqual(hookPhases, statePhases);
});
