import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFUSAL_HANDLERS, isRetryable, refusalHandler } from '../lib/refusal-handlers.mjs';

const KINDS = ['plan drift', 'input unreachable', 'outside Files', 'report missing', 'proof failed', 'env', 'code rule', 'start stop', 'refused', 'landed', 'pin', 'lock', 'unfinished merge'];

test('every refusal kind maps to one single-line Then: handler', () => {
  assert.deepEqual(Object.keys(REFUSAL_HANDLERS).sort(), [...KINDS].sort());
  for (const kind of KINDS) {
    const line = refusalHandler(kind);
    assert.match(line, /^Then: \S/, kind);
    assert.ok(!line.includes('\n'), kind);
  }
});

test('an unknown refusal kind throws', () => {
  assert.throws(() => refusalHandler('mystery'), /no refusal handler for 'mystery'/);
});

test('the input unreachable handler stops the run BLOCKED and parks no task for an answer', () => {
  const line = refusalHandler('input unreachable');
  assert.match(line, /stop the run `BLOCKED`/);
  assert.ok(!line.includes('NEEDS ANSWER'));
});

test('a stop kind is not retryable', () => {
  for (const kind of ['refused', 'landed', 'pin', 'lock', 'unfinished merge', 'env', 'code rule', 'input unreachable']) assert.equal(isRetryable(kind), false, kind);
  for (const kind of ['proof failed', 'outside Files', 'report missing', 'plan drift']) assert.equal(isRetryable(kind), true, kind);
});
