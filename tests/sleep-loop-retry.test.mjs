import assert from 'node:assert/strict';
import test from 'node:test';
import { SLEEP_STEP } from '../hooks/dispatch-bash.mjs';

const verdict = (command, extra = {}) => SLEEP_STEP.run({ tool_name: 'Bash', tool_input: { command, ...extra } });
const noted = (command, extra) => Boolean(verdict(command, extra)?.hookSpecificOutput.additionalContext);

test('a foreground wait loop gets the note with the background route', () => {
  const output = verdict('until [ -f done ]; do sleep 2; done').hookSpecificOutput;
  assert.equal(output.permissionDecision, undefined);
  assert.match(output.additionalContext, /run_in_background/);
  assert.ok(noted('bash -lc "until [ -f done ]; do sleep 5; done"'));
  assert.ok(noted('timeout 600 npm test; until [ -f done ]; do sleep 20; done'));
});

test('a loop in a background Bash call passes with no note', () => {
  assert.equal(verdict('until [ -f done ]; do sleep 2; done', { run_in_background: true }), null);
});

test('a Monitor call passes with no note', () => {
  const output = SLEEP_STEP.run({ tool_name: 'Monitor', tool_input: { command: 'until [ -f done ]; do sleep 2; done' } });
  assert.equal(output, null);
});

test('quoted loop words and data quotes pass', () => {
  assert.equal(verdict('git commit -m "retry while CI runs, do not sleep on it"'), null);
});
