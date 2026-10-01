// The Edit dispatcher runs the repeat guard and the delegate budget in one
// process: the second identical web search is denied, an Edit and a first
// search pass, and a denied call is not counted by the budget.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-edit.mjs', import.meta.url));

async function dispatchTwice(hookInput) {
  const directory = await fixture();
  const options = { cwd: directory, input: JSON.stringify(hookInput), env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory } };
  return [await run(DISPATCHER, [], options), await run(DISPATCHER, [], options)];
}

test('the second identical web search is denied by the repeat guard through the dispatcher', async () => {
  const [first, second] = await dispatchTwice({ tool_name: 'WebSearch', session_id: 's1', tool_input: { query: 'exo hooks' } });
  assert.deepEqual([first.code, first.stdout], [0, '']);
  assert.equal(second.code, 0, second.stderr);
  const decision = JSON.parse(second.stdout).hookSpecificOutput;
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /repeat guard/);
});

test('a first Edit and unusable input produce no output', async () => {
  const [first] = await dispatchTwice({ tool_name: 'Edit', session_id: 's1', tool_input: { file_path: '/tmp/x', old_string: 'a', new_string: 'b' } });
  assert.deepEqual([first.code, first.stdout], [0, '']);
  const directory = await fixture();
  const broken = await run(DISPATCHER, [], { cwd: directory, input: '{ not json', env: { CLAUDE_CONFIG_DIR: directory } });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});

test('a denied call is not counted by the delegate budget', async () => {
  let counted = 0;
  const budget = { name: 'budget', run: () => { counted += 1; return null; } };
  const refusal = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'no' } };
  const refused = await dispatchEdit({}, [], [{ name: 'repeat', run: () => refusal }, budget]);
  assert.equal(refused.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(counted, 0);
});
