// The context watch speaks only after a completed task, only in the main
// session, and only once the last assistant turn's prompt passed the
// `context` setting; a fault never blocks the tool call.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const WATCH = fileURLToPath(new URL('../skills/savings/scripts/context-watch.mjs', import.meta.url));
const ADVICE = 'the next phase runs in a delegate, or hands off when it asks the user';

function runWatch(hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [WATCH],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
  });
}

// Input 1,000 plus cache creation 4,000 plus cache read makes the prompt size.
function assistantLine(promptTokens, { sidechain = false } = {}) {
  const usage = { input_tokens: 1000, cache_read_input_tokens: promptTokens - 5000, cache_creation_input_tokens: 4000, output_tokens: 700 };
  return JSON.stringify({ type: 'assistant', isSidechain: sidechain, message: { id: `msg-${promptTokens}`, model: 'claude-test', usage } });
}

async function watchFixture(lines, project) {
  const root = await fixture();
  const configDirectory = await fixture();
  if (project) {
    await fs.mkdir(path.join(root, '.claude'), { recursive: true });
    await fs.writeFile(path.join(root, '.claude', 'exo.json'), `${JSON.stringify(project)}\n`);
  }
  const transcript = path.join(root, 'transcript.jsonl');
  await fs.writeFile(transcript, `${lines.join('\n')}\n`);
  const env = { CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PLUGIN_OPTION_CONTEXT: '' };
  const hookInput = {
    session_id: 's1',
    transcript_path: transcript,
    hook_event_name: 'PostToolUse',
    tool_name: 'TaskUpdate',
    tool_input: { taskId: '1', status: 'completed' }
  };
  return { env, hookInput };
}

test('a completed task under the threshold prints nothing', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(60_000)]);
  const result = await runWatch(hookInput, env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('a completed task past the default 80k sends one context line', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(90_000)]);
  const result = await runWatch(hookInput, env);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.equal(output.hookSpecificOutput.additionalContext, `exo: context 90k tokens, past 80k: ${ADVICE}`);
});

test('the context setting moves the threshold, and an invalid value reads as 80', async () => {
  const raised = await watchFixture([assistantLine(90_000)], { context: 100 });
  assert.equal((await runWatch(raised.hookInput, raised.env)).stdout, '');
  const lowered = await watchFixture([assistantLine(60_000)], { context: 50 });
  assert.match((await runWatch(lowered.hookInput, lowered.env)).stdout, /exo: context 60k tokens, past 50k/);
  const invalid = await watchFixture([assistantLine(90_000)], { context: 0 });
  assert.match((await runWatch(invalid.hookInput, invalid.env)).stdout, /exo: context 90k tokens, past 80k/);
});

test('only the last main-thread assistant turn counts', async () => {
  const { env, hookInput } = await watchFixture([
    assistantLine(200_000),
    JSON.stringify({ type: 'user', message: { content: 'next' } }),
    assistantLine(30_000),
    assistantLine(250_000, { sidechain: true })
  ]);
  assert.equal((await runWatch(hookInput, env)).stdout, '');
});

test('a delegate, a task not completed and a broken input print nothing and exit 0', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(200_000)]);
  const inputs = [
    { ...hookInput, agent_id: 'a1' },
    { ...hookInput, tool_input: { taskId: '1', status: 'in_progress' } },
    { ...hookInput, transcript_path: path.join(path.dirname(hookInput.transcript_path), 'missing.jsonl') },
    'not json'
  ];
  for (const input of inputs) {
    const result = await runWatch(input, env);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '', JSON.stringify(input));
  }
});
