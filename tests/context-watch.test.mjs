// The context watch measures the main session after every tool call. From the
// `context` setting it sends one handoff notice per 25k step, to the user as
// well from 150k; inside a delegate and on any fault it stays silent, and it
// never decides a permission.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const WATCH = fileURLToPath(new URL('../skills/show-savings/scripts/context-watch.mjs', import.meta.url));
const ADVICE = 'finish the current step, then tell the user to run `/exo:save-session` followed by `/clear`; an orchestrating run whose state lives in its own run file writes that file first and names it to the user';

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
  const env = { CLAUDE_PROJECT_DIR: root, CLAUDE_CONFIG_DIR: configDirectory, CLAUDE_PLUGIN_OPTION_CONTEXT: '', EXO_SAVINGS_DIR: '' };
  const hookInput = {
    session_id: 's1',
    transcript_path: transcript,
    hook_event_name: 'PostToolUse',
    tool_name: 'Bash',
    tool_input: { command: 'ls' }
  };
  return { env, hookInput, transcript };
}

// The notice text the watch sends, or null when it prints nothing.
async function notice(hookInput, env) {
  const result = await runWatch(hookInput, env);
  assert.equal(result.code, 0, result.stderr);
  if (result.stdout === '') return null;
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(output.hookSpecificOutput.permissionDecision, undefined);
  assert.equal(output.decision, undefined);
  return output;
}

test('any tool call under the threshold prints nothing', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(99_000)]);
  assert.equal(await notice(hookInput, env), null);
});

test('a tool call at the default 100k sends the handoff notice and no permission decision', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(100_000)]);
  const output = await notice(hookInput, env);
  assert.equal(output.hookSpecificOutput.additionalContext, `exo: context 100k tokens, past 100k: ${ADVICE}`);
  assert.equal(output.systemMessage, undefined);
});

test('the notice repeats once per 25k step and again after the figure falls back', async () => {
  const { env, hookInput, transcript } = await watchFixture([assistantLine(101_000)]);
  const fired = async (tokens) => {
    await fs.writeFile(transcript, `${assistantLine(tokens)}\n`);
    return (await notice(hookInput, env)) !== null;
  };
  assert.equal(await fired(101_000), true, 'first step');
  assert.equal(await fired(101_000), false, 'same figure again');
  assert.equal(await fired(124_000), false, 'still inside the first step');
  assert.equal(await fired(125_000), true, 'next step');
  assert.equal(await fired(140_000), false, 'inside the second step');
  assert.equal(await fired(60_000), false, 'under the threshold after a compaction');
  assert.equal(await fired(102_000), true, 'first step again after the reset');
});

test('from 150k the notice also goes to the user as a systemMessage', async () => {
  const below = await watchFixture([assistantLine(149_000)]);
  assert.equal((await notice(below.hookInput, below.env)).systemMessage, undefined);
  const at = await watchFixture([assistantLine(150_000)]);
  const output = await notice(at.hookInput, at.env);
  assert.equal(output.systemMessage, `exo: context 150k tokens, past 100k: ${ADVICE}`);
  assert.equal(output.hookSpecificOutput.additionalContext, output.systemMessage);
});

test('the context setting moves the threshold, and an invalid value reads as 100', async () => {
  const raised = await watchFixture([assistantLine(110_000)], { context: 120 });
  assert.equal(await notice(raised.hookInput, raised.env), null);
  const lowered = await watchFixture([assistantLine(60_000)], { context: 50 });
  assert.match((await notice(lowered.hookInput, lowered.env)).hookSpecificOutput.additionalContext, /^exo: context 60k tokens, past 50k: /);
  const invalid = await watchFixture([assistantLine(90_000)], { context: 0 });
  assert.equal(await notice(invalid.hookInput, invalid.env), null);
});

test('only the last main-thread assistant turn counts', async () => {
  const { env, hookInput } = await watchFixture([
    assistantLine(200_000),
    JSON.stringify({ type: 'user', message: { content: 'next' } }),
    assistantLine(30_000),
    assistantLine(250_000, { sidechain: true })
  ]);
  assert.equal(await notice(hookInput, env), null);
});

test('inside a subagent the watch is silent', async () => {
  const { env, hookInput } = await watchFixture([assistantLine(200_000)]);
  assert.equal(await notice({ ...hookInput, agent_id: 'a1' }, env), null);
});

test('a missing transcript, a torn one and a broken input print nothing and exit 0', async () => {
  const { env, hookInput, transcript } = await watchFixture([assistantLine(200_000)]);
  const missing = { ...hookInput, transcript_path: path.join(path.dirname(transcript), 'missing.jsonl') };
  assert.equal(await notice(missing, env), null);
  const torn = path.join(path.dirname(transcript), 'torn.jsonl');
  const userLine = JSON.stringify({ type: 'user', message: { content: 'go' } });
  await fs.writeFile(torn, `${userLine}\n${assistantLine(200_000).slice(0, 120)}`);
  assert.equal(await notice({ ...hookInput, transcript_path: torn }, env), null);
  assert.equal(await notice('not json', env), null);
});
