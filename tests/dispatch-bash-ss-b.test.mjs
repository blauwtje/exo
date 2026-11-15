import assert from 'node:assert/strict';
import { test } from 'node:test';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra };
  return (await dispatchBash(input, undefined, () => false))?.hookSpecificOutput;
}

const subagent = { agent_id: 'agent-1', agent_type: 'exo:build-task' };

test('every subagent is noted on sleep and told to run it in the background and end the turn', async () => {
  const output = await decide('sleep 30', subagent);
  assert.equal(output?.permissionDecision, undefined);
  assert.match(output.additionalContext, /in the background, end the turn/);
});

test('the main session is noted on sleep too and never denied', async () => {
  assert.notEqual((await decide('sleep 1'))?.permissionDecision, 'deny');
});
