import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
const { scriptBytes } = await import('../lib/context-limits.mjs');

async function decide(command, extra = {}) {
  const input = { hook_event_name: 'PreToolUse', tool_name: 'Bash', agent_id: 'agent-1', tool_input: { command }, ...extra };
  const output = await dispatchBash(input, undefined, () => false);
  return output?.hookSpecificOutput;
}

test('an over-limit command is allowed and rewritten to run its saved copy', async () => {
  const cwd = tempDir('exo-long-');
  const command = `echo ${'x'.repeat(scriptBytes() + 10)}`;
  const output = await decide(command, { cwd });
  const hash = createHash('sha256').update(command).digest('hex').slice(0, 12);
  const relative = `.exo/long-command-${hash}.sh`;
  assert.notEqual(output.permissionDecision, 'deny');
  assert.equal(output.updatedInput.command, `bash ${relative}`);
  assert.equal(fs.readFileSync(path.join(cwd, relative), 'utf8'), command);
  assert.ok(output.additionalContext.includes(relative));
  assert.equal(output.additionalContext.split('\n').length, 1);
});
