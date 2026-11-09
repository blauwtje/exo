import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIEF_RULES } from '../lib/brief-rules.mjs';

test('the over-fetches denial does not tell the orchestrator to lower the count', () => {
  const row = BRIEF_RULES.find((entry) => entry.id === 'brief-over-fetches');
  assert.doesNotMatch(row.allowed, /lower the/i);
  assert.match(row.allowed, /split/);
});
