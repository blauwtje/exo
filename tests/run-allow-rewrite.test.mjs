// why: a run session gates Bash on dontAsk prefix allow rules; a command one allowed must stay allowed.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { allowRules, childEnv } from '../skills/build/scripts/run-session.mjs';

const matches = (rules, command) => rules.some((rule) => {
  const body = /^Bash\((.*)\)$/.exec(rule)?.[1];
  if (body === undefined) return false;
  return body.endsWith(' *') ? command.startsWith(body.slice(0, -1)) : command === body;
});

test('an allowed command with an = word stays allowed after the Bash shell fix', async () => {
  const rules = allowRules({ root: '/tmp/root', planPath: '/tmp/root/plan.md', plan: { frame: {}, tasks: [] }, decisions: false });
  const command = 'grep -n =foo f';
  assert.equal(matches(rules, command), true, 'precondition: the original command is allowed');
  process.env.EXO_RUN_SESSION = childEnv(null, { name: 'claude', env: {}, effort: null, promptCacheTtl: null }).EXO_RUN_SESSION;
  try {
    const output = await dispatchBash({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } }, undefined, () => false);
    const rewritten = output?.hookSpecificOutput?.updatedInput?.command ?? command;
    assert.equal(matches(rules, rewritten), true, `rewritten command matches no allow rule: ${rewritten}`);
  } finally {
    delete process.env.EXO_RUN_SESSION;
  }
});
