import assert from 'node:assert/strict';
import test from 'node:test';
import { UsageError, parseFlags } from '../lib/script-flags.mjs';

test('an unknown flag error lists the known flags', () => {
  assert.throws(
    () => parseFlags(['--x'], { a: 'boolean', b: 'list' }),
    (error) => error instanceof UsageError && error.message === "unknown flag '--x'; known: --a, --b",
  );
});
