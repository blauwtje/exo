// A disk-wide find from an agent ran into the 120 s tool timeout 7 times. The
// Bash hook now denies find on /, ~, $HOME and .., and lets -maxdepth 1 and
// in-checkout searches through.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { childEnv } from '../skills/build/scripts/run-session.mjs';

const PROVIDER = { name: 'claude', env: {}, effort: null, promptCacheTtl: null };

async function decide(command) {
  const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, undefined, () => false);
  return output?.hookSpecificOutput;
}

test('find on /, ~, $HOME or .. is denied with a reason that points inside the checkout', async () => {
  for (const command of ['find / -name plan.md', 'find ~ -name plan.md', 'find ~/ -name x', 'find $HOME -name x', 'find "$HOME" -name x', 'find .. -name plan.md', 'find ../.. -name x', 'cd x && find / -name y', 'ls | xargs echo; find -L / -name y']) {
    const verdict = await decide(command);
    assert.equal(verdict?.permissionDecision, 'deny', command);
    assert.match(verdict.permissionDecisionReason, /inside the checkout/, command);
    assert.match(verdict.permissionDecisionReason, /BLOCKED/, command);
  }
});

test('find with -maxdepth 1, or inside the checkout, passes', async () => {
  for (const command of ['find / -maxdepth 1 -name tmp', 'find .. -maxdepth 1 -name x', 'find . -name plan.md', 'find /tmp/x -name y', 'find skills -name SKILL.md', 'echo find /']) {
    assert.notEqual((await decide(command))?.permissionDecision, 'deny', command);
  }
});

test('a Bash call with an = word is rewritten, and a denied one is not', async () => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo =ls' } };
  const rewritten = await dispatchBash(input, undefined, () => false);
  assert.match(rewritten.hookSpecificOutput.updatedInput.command, /setopt noequals; echo =ls/);
  assert.equal(rewritten.hookSpecificOutput.permissionDecision, undefined);
  const denied = await dispatchBash({ ...input, tool_input: { command: 'find / -name x; echo =ls' } }, undefined, () => false);
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
