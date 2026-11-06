import assert from 'node:assert/strict';
import test from 'node:test';
import { UsageError, environmentDelayMs, environmentMs, parseFlags } from '../lib/script-flags.mjs';

test('an unknown flag error lists the known flags', () => {
  assert.throws(
    () => parseFlags(['--x'], { a: 'boolean', b: 'list' }),
    (error) => error instanceof UsageError && error.message === "unknown flag '--x'; known: --a, --b",
  );
});

test('environmentDelayMs accepts zero where environmentMs falls back', () => {
  const env = { A: '0', B: '25', C: 'x', D: '-1' };
  assert.equal(environmentDelayMs('A', 7, env), 0);
  assert.equal(environmentDelayMs('B', 7, env), 25);
  assert.equal(environmentDelayMs('C', 7, env), 7);
  assert.equal(environmentDelayMs('D', 7, env), 7);
  assert.equal(environmentDelayMs('E', 7, env), 7);
  assert.equal(environmentMs('A', 7, env), 7);
});
