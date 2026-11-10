import assert from 'node:assert/strict';
import test from 'node:test';
import { SLEEP_STEP } from '../hooks/dispatch-bash.mjs';

const decision = (command) => SLEEP_STEP.run({ tool_input: { command } })?.hookSpecificOutput.permissionDecision ?? 'allow';

test('a bounded retry and quoted loop words pass while a background polling loop is still refused', () => {
  assert.equal(decision('git commit -m "retry while CI runs, do not sleep on it"'), 'allow');
  assert.equal(decision('timeout 60 bash -c "until curl -s localhost; do sleep 1; done"'), 'allow');
  assert.equal(decision('until [ -f done ]; do sleep 2; done'), 'deny');
});

test('a timeout elsewhere in the command does not exempt a polling loop outside it', () => {
  assert.equal(decision('timeout 600 npm test; until [ -f done ]; do sleep 20; done'), 'deny');
});

test('a polling loop inside a shell -c or eval argument is refused while data quotes stay allowed', () => {
  assert.equal(decision('bash -lc "until [ -f done ]; do sleep 5; done"'), 'deny');
  assert.equal(decision('eval "until [ -f done ]; do sleep 5; done"'), 'deny');
  assert.equal(decision('echo "until x; do sleep 5; done"'), 'allow');
});

test('gtimeout and timeout -k around the loop bound it', () => {
  assert.equal(decision('gtimeout 60 bash -c "until [ -f done ]; do sleep 1; done"'), 'allow');
  assert.equal(decision('timeout -k 5 60 bash -c "until [ -f done ]; do sleep 1; done"'), 'allow');
  assert.equal(decision('timeout 60 bash -c "until [ -f done ]; do sleep 1; done"'), 'allow');
});
