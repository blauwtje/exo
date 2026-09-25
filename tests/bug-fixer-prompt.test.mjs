import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const PROMPT = new URL('../skills/run-plan/bug-fixer-prompt.md', import.meta.url);

const HANDOFF_FIELDS = [
  'Symptom',
  'Repro',
  'Expected',
  'Actual',
  'Log',
  'Hypotheses',
  'Cause',
  'Mechanism',
  'Prediction',
  'Ranges',
  'Status',
  'Edits',
  'Proof',
  'Unresolved',
];

test('bug-fixer-prompt.md names the exo/debug/task-<n>.md handoff path', () => {
  const source = fs.readFileSync(PROMPT, 'utf8');
  assert.ok(source.includes('exo/debug/task-<n>.md'), 'names exo/debug/task-<n>.md');
});

test('bug-fixer-prompt.md names Steps 1 to 5', () => {
  const source = fs.readFileSync(PROMPT, 'utf8');
  assert.ok(source.includes('Steps 1 to 5'), 'names Steps 1 to 5');
});

test('bug-fixer-prompt.md drops the old bug-fixer-<n>.md path', () => {
  const source = fs.readFileSync(PROMPT, 'utf8');
  assert.ok(!source.includes('bug-fixer-<n>.md'), 'no longer names bug-fixer-<n>.md');
});

test('bug-fixer-prompt.md report fields match the D1 handoff field names', () => {
  const source = fs.readFileSync(PROMPT, 'utf8');
  for (const field of HANDOFF_FIELDS) {
    assert.ok(source.includes(`\`${field}\``), `report names ${field}`);
  }
});
