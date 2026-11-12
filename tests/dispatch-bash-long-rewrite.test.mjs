import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { tempDir } from './harness.mjs';

const { dispatchBash } = await import('../hooks/dispatch-bash.mjs');
const { scriptBytes, agentContextTarget } = await import('../lib/context-limits.mjs');

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

const { TIMEOUT_FUNCTION } = await import('../lib/shell-fixes.mjs');

async function capped(toolInput, extra = {}) {
  const output = await decide(toolInput.command, { tool_input: toolInput, permission_mode: 'bypassPermissions', ...extra });
  return (output?.updatedInput?.command ?? toolInput.command).replace(TIMEOUT_FUNCTION, '');
}

test('a subagent foreground call is capped 5 s under the default timeout', async () => {
  assert.match(await capped({ command: 'node build.mjs' }), /timeout 115 /);
});

test('a subagent call with an explicit timeout is capped 5 s under it', async () => {
  assert.match(await capped({ command: 'node build.mjs', timeout: 300000 }), /timeout 295 /);
});

test('a background call is not capped', async () => {
  assert.equal(await capped({ command: 'node build.mjs', run_in_background: true }), 'node build.mjs');
});

test('the lead session is not capped', async () => {
  assert.equal(await capped({ command: 'node build.mjs' }, { agent_id: undefined }), 'node build.mjs');
});

test('an over-limit rewrite is capped as well', async () => {
  const cwd = tempDir('exo-long-');
  const command = await capped({ command: `echo ${'x'.repeat(scriptBytes() + 10)}` }, { cwd });
  assert.match(command, /timeout 115 /);
  assert.ok(command.includes('.exo/long-command-'));
});

test('a command that already starts with timeout is not wrapped again', async () => {
  assert.equal(await capped({ command: 'timeout 30 node build.mjs' }), 'timeout 30 node build.mjs');
});

test('default permission mode is not capped', async () => {
  assert.equal(await capped({ command: 'node build.mjs' }, { permission_mode: 'default' }), 'node build.mjs');
});

test('a run session is not capped', async () => {
  process.env.EXO_RUN_SESSION = '1';
  try {
    assert.equal(await capped({ command: 'node build.mjs' }), 'node build.mjs');
  } finally {
    delete process.env.EXO_RUN_SESSION;
  }
});

test('the timeout sits inside the result-cap wrapper so the head and log still print', async () => {
  const transcript = path.join(tempDir('exo-room-'), 'agent.jsonl');
  fs.writeFileSync(transcript, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: agentContextTarget() - 2000 } } })}\n`);
  const command = await capped({ command: 'node build.mjs' }, { agent_type: 'general-purpose', agent_transcript_path: transcript });
  const [first, ...rest] = command.split('\n');
  assert.match(first, /^\( .*timeout 115 /);
  assert.match(rest.join('\n'), /head -c [\s\S]*\nexit \$rc$/);
  assert.doesNotMatch(command, /^timeout /);
});

test('a timeout above the Claude Code maximum clamps to it', async () => {
  assert.match(await capped({ command: 'node build.mjs', timeout: 900000 }), /timeout 595 /);
});

test('a small timeout keeps half of it as margin', async () => {
  assert.match(await capped({ command: 'node build.mjs', timeout: 4000 }), /timeout 2 /);
});

test('the capped command runs under the session shell', async () => {
  assert.match(await capped({ command: 'node build.mjs' }), /"\$\{SHELL:-\/bin\/sh\}" -c 'node build.mjs'/);
});
