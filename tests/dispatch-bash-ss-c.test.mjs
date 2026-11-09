import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recordPass } from '#check-cache';
import { landingCheckout, editApp } from './land-task-fixture.mjs';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
const NODE_PASS = 'ℹ tests 3\nℹ pass 3\nℹ fail 0\n';

async function decide(command, cwd) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', agent_type: 'exo:build-task', cwd, tool_input: { command } };
  return (await dispatchBash(input, undefined, () => false))?.hookSpecificOutput;
}

test('a whole suite on a tree that already passed it is refused', async () => {
  const { root } = await landingCheckout();
  await editApp(root);
  recordPass(root, 'npm test', 5, undefined, NODE_PASS);
  const output = await decide('npm test', root);
  assert.equal(output?.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /already passed/);
});

test('a whole suite on a changed tree runs', async () => {
  const { root } = await landingCheckout();
  recordPass(root, 'npm test', 5, undefined, NODE_PASS);
  await editApp(root);
  assert.notEqual((await decide('npm test', root))?.permissionDecision, 'deny');
});
