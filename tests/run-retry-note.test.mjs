import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { appendRuledOut } from '../lib/ruled-out.mjs';
import { failedAttemptNote } from '../skills/build/scripts/run-plan-landing.mjs';

const root = () => fs.mkdtempSync(path.join(os.tmpdir(), 'retry-note-'));
const lines = (note) => note.split('\n');
const attempt = { task: 3, last: 'Task 3: BLOCKED', log: '/tmp/run/land-task-3.log' };

test('the retry note carries the ruled-out record of the failed attempt', () => {
  const dir = root();
  appendRuledOut(dir, 3, 'a change to src/a.js', 'proof stayed red');
  const note = failedAttemptNote({ root: dir, ...attempt, proofEnd: 'proof stayed red' });
  assert.match(note, /did not land task 3\. Its last result line: Task 3: BLOCKED/);
  assert.ok(lines(note).includes('Ruled out for task 3 (take none of these again):'));
  assert.ok(lines(note).includes('- tried a change to src/a.js; failed because proof stayed red'));
  assert.equal(failedAttemptNote({ root: root(), ...attempt }).includes('Ruled out'), false);
});

test('the retry note names the model switch when the session ran on the fallback model', () => {
  const note = failedAttemptNote({ root: root(), ...attempt, fallback: { from: 'sonnet', to: 'haiku' } });
  assert.ok(lines(note).includes('That attempt ran on haiku instead of sonnet because the provider was overloaded.'));
  assert.equal(failedAttemptNote({ root: root(), ...attempt }).includes('overloaded'), false);
});
