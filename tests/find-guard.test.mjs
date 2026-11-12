import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { childEnv } from '../skills/build/scripts/run-session-env.mjs';

const PROVIDER = { name: 'claude', env: {}, effort: null, promptCacheTtl: null };

async function decide(command) {
  const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, undefined, () => false);
  return output?.hookSpecificOutput;
}

test('a Bash call with an = word is rewritten, and a denied one is not', async () => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo =ls' } };
  const rewritten = await dispatchBash(input, undefined, () => false);
  assert.match(rewritten.hookSpecificOutput.updatedInput.command, /setopt noequals; echo =ls/);
  assert.equal(rewritten.hookSpecificOutput.permissionDecision, undefined);
  const denied = await dispatchBash({ ...input, agent_id: 'agent-1', tool_input: { command: 'git stash; echo =ls' } }, undefined, () => false);
  assert.equal(denied.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(denied.hookSpecificOutput.updatedInput, undefined);
});

// why: a run session gates Bash on prefix allow rules, so the dispatcher leaves its commands unrewritten, guard or not.
test('a run child env from childEnv carries the run marker, and the dispatcher then leaves the Bash command alone', async () => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo =ls' } };
  const marker = childEnv(null, PROVIDER).EXO_RUN_SESSION;
  assert.equal(marker, '1');
  process.env.EXO_RUN_SESSION = marker;
  try {
    assert.equal(await dispatchBash(input, undefined, () => false), null);
  } finally {
    delete process.env.EXO_RUN_SESSION;
  }
});
