// A builder that meets a point its brief leaves open must park it as a
// question, not guess; run-unit must pass that question on per task.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const read = (file) => fs.readFileSync(fileURLToPath(new URL(`../${file}`, import.meta.url)), 'utf8');

test('build-task parks an unsettled point as BLOCKED NEEDS ANSWER', () => {
  const text = read('agents/build-task.md');
  assert.match(text, /Task <n>: BLOCKED NEEDS ANSWER: <one short question>/);
  assert.match(text, /safe default cheap to undo/);
});

test('task mode names the parked question for a choice it cannot rule', () => {
  assert.match(read('skills/build/references/task-mode.md'), /BLOCKED NEEDS ANSWER: <one short question>/);
});

test('run-unit relays the question per task', () => {
  assert.match(read('agents/run-unit.md'), /BLOCKED <n> NEEDS ANSWER: <question>/);
});

test('the lead asks parked questions after the wave and re-dispatches with the answer', () => {
  for (const file of ['skills/build/references/run-loop.md', 'skills/build/references/run-loop-direct.md']) {
    const text = read(file);
    assert.match(text, /NEEDS ANSWER/);
    assert.match(text, /after the wave/);
    assert.match(text, /prompt only/);
  }
  assert.match(read('skills/build/references/agent-cases.md'), /NEEDS ANSWER: <question>/);
  assert.match(read('docs/skills/build.md'), /rebuilt with your answer/);
});
