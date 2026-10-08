import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

const DELEGATE_WAIT_PARTS = ['foreground with Bash `timeout: 600000`', '`for` loop', 'never call `Monitor` or start with `sleep`'];

const POINTER = new URL('../skills/build/bug-fixer-prompt.md', import.meta.url);
const PROMPT = new URL('../skills/find-cause/fixer-prompt.md', import.meta.url);
const HANDOFF = new URL('../skills/find-cause/references/handoff.md', import.meta.url);

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
  'Tests',
  'Edits',
  'Proof',
  'Unresolved',
];

const read = (url) => fs.readFileSync(url, 'utf8');

test('bug-fixer-prompt.md sends the build opening of the shared fixer prompt', () => {
  const source = read(POINTER);
  assert.ok(source.includes('../find-cause/fixer-prompt.md'), 'points at the shared fixer prompt');
  assert.ok(source.includes('## build opening'), 'names the build opening');
});

test('the shared fixer prompt has a find-cause opening, a build opening and a shared block', () => {
  const source = read(PROMPT);
  for (const heading of ['## find-cause opening', '## build opening', '## Shared block']) {
    assert.ok(source.includes(heading), `has ${heading}`);
  }
});

test('the build opening names the exo/debug/task-<n>.md handoff path and Steps 1 to 5', () => {
  const source = read(PROMPT);
  assert.ok(source.includes('exo/debug/task-<n>.md'), 'names exo/debug/task-<n>.md');
  assert.ok(source.includes('Steps 1 to 5'), 'names Steps 1 to 5');
  assert.ok(!source.includes('bug-fixer-<n>.md'), 'no longer names bug-fixer-<n>.md');
});

test('only references/handoff.md lists the handoff fields; the prompts point at it', () => {
  const handoff = read(HANDOFF);
  for (const field of HANDOFF_FIELDS) {
    assert.ok(handoff.includes(`\`${field}\``), `handoff.md names ${field}`);
  }
  const investigator = read(new URL('../skills/find-cause/investigator-prompt.md', import.meta.url));
  for (const source of [read(PROMPT), investigator]) {
    assert.ok(source.includes('`references/handoff.md`'), 'points at references/handoff.md');
    for (const field of ['Hypotheses', 'Mechanism', 'Prediction', 'Edits']) {
      assert.ok(!source.includes(`\`${field}\``), `does not list ${field}`);
    }
  }
});

test('the shared block waits in the foreground or a bounded for loop, never Monitor or a leading sleep', () => {
  const source = read(PROMPT);
  assert.ok(DELEGATE_WAIT_PARTS.every((part) => source.includes(part)), 'the hard boundaries carry the wait line');
});
