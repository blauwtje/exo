import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkHookSet } from '../verify/checks/hook-set.mjs';
import { createRepository } from '../verify/repository.mjs';
import { checkOutcome, tree } from './check-outcome.mjs';

const command = { hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hook.mjs"', timeout: 5 }] };

test('an unquoted command naming a missing script fails', () => {
  const unquoted = { hooks: [{ ...command.hooks[0], command: 'node ${CLAUDE_PLUGIN_ROOT}/hooks/missing.mjs' }] };
  const hooks = { SessionStart: [unquoted], UserPromptSubmit: [command] };
  const result = checkOutcome(checkHookSet, createRepository(tree({ 'hooks/hooks.json': JSON.stringify({ hooks }), 'hook.mjs': '' })));
  assert.equal(result.ok, false);
  assert.match(result.detail, /event SessionStart command names missing file hooks\/missing\.mjs/);
});
