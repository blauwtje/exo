import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BRIEF_RULES } from '../lib/brief-rules.mjs';

test('the over-fetches denial does not tell the orchestrator to lower the count', () => {
  const row = BRIEF_RULES.find((entry) => entry.id === 'brief-over-fetches');
  assert.doesNotMatch(row.allowed, /lower the/i);
  assert.match(row.allowed, /split/);
});

test('the unresolved denial states the note forms and the existing-files limit', () => {
  const row = BRIEF_RULES.find((entry) => entry.id === 'brief-unresolved');
  assert.match(row.allowed, /\[note\]/);
  assert.match(row.allowed, /name only files that exist now/);
});
