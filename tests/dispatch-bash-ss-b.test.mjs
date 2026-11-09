import assert from 'node:assert/strict';
import { test } from 'node:test';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command }, ...extra };
  return (await dispatchBash(input, undefined, () => false))?.hookSpecificOutput;
}

const subagent = { agent_id: 'agent-1', agent_type: 'exo:build-task' };

test('every subagent is denied sleep and told to run it in the background and end the turn', async () => {
  const output = await decide('sleep 30', subagent);
  assert.equal(output?.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /in the background, end the turn/);
});

for (const command of ['gh pr checks 5 --watch', 'gh run watch 123']) {
  test(`a subagent is denied ${command}`, async () => {
    const output = await decide(command, subagent);
    assert.equal(output?.permissionDecision, 'deny');
    assert.match(output.permissionDecisionReason, /let the lead wait/);
  });

  test(`the main session keeps ${command}`, async () => {
    assert.notEqual((await decide(command))?.permissionDecision, 'deny');
  });
}

test('the main session keeps sleep', async () => {
  assert.notEqual((await decide('sleep 1'))?.permissionDecision, 'deny');
});
