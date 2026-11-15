import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { childEnv } from '../skills/build/scripts/run-session-env.mjs';

const PROVIDER = { name: 'claude', env: {}, effort: null, promptCacheTtl: null };

test('a run child env from childEnv carries the run marker, and the dispatcher then leaves the Bash command alone', async () => {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo =ls' } };
  const marker = childEnv(null, PROVIDER, { handoff: null, ecosystemEnv: {}, repair: false, refuseCommits: null }).EXO_RUN_SESSION;
  assert.equal(marker, '1');
  process.env.EXO_RUN_SESSION = marker;
  try {
    assert.equal(await dispatchBash(input, undefined, () => false), null);
  } finally {
    delete process.env.EXO_RUN_SESSION;
  }
});
