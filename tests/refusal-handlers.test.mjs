import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REFUSAL_HANDLERS, refusalHandler } from '../lib/refusal-handlers.mjs';

const KINDS = ['plan drift', 'outside Files', 'report missing', 'proof failed', 'env', 'code rule', 'start stop'];

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
