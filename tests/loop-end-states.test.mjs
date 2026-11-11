import assert from 'node:assert/strict';
import test from 'node:test';
import { END_STATES, decide, recordRound } from '../lib/loop-budget.mjs';
import { outcome } from '../lib/run-outcomes.mjs';
import { tempDir } from './harness.mjs';

test('the three end states each have a run outcome', () => {
  assert.deepEqual([...END_STATES], ['rounds-spent', 'no-progress', 'needs-input']);
  for (const state of END_STATES) assert.equal(outcome(state).kind, state);
});

test('a spent cap ends as rounds-spent', () => {
  const dir = tempDir('exo-end-');
  recordRound(dir, { kind: 'review', openBefore: 9, openAfter: 5 });
  recordRound(dir, { kind: 'review', openBefore: 5, openAfter: 3 });
  recordRound(dir, { kind: 'review', openBefore: 3, openAfter: 1 });
  assert.equal(decide(dir, 'review', { env: {} }).state, 'rounds-spent');
});

test('a round that fixed nothing ends as no-progress', () => {
  const dir = tempDir('exo-end-');
  recordRound(dir, { kind: 'review', openBefore: 4, openAfter: 4 });
  assert.equal(decide(dir, 'review', { env: {} }).state, 'no-progress');
});

test('a round with a question open ends as needs-input', () => {
  const dir = tempDir('exo-end-');
  recordRound(dir, { kind: 'review', openBefore: 4, openAfter: 2, needsInput: true });
  assert.equal(decide(dir, 'review', { env: {} }).state, 'needs-input');
});
