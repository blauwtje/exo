// The prompt dispatcher runs the nudge and expand-reply handlers in
// one process and joins their additionalContext strings in that order; a
// fault in one handler costs only its own string.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const DISPATCH = path.join(REPOSITORY, 'hooks', 'dispatch-prompt.mjs');
const START_BYTES = 1000;

function runDispatch(input, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [DISPATCH],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

// An empty config directory and project keep the caller's settings out; `replies` writes a project setting.
async function dispatchFixture(replies = null) {
  const directory = await fixture();
  const project = path.join(directory, 'project');
  await fs.mkdir(path.join(project, '.claude'), { recursive: true });
  if (replies !== null) await fs.writeFile(path.join(project, '.claude', 'exo.json'), replies);
  const transcript = path.join(directory, 'transcript.jsonl');
  await fs.writeFile(transcript, 'x'.repeat(START_BYTES));
  const env = {
    CLAUDE_CONFIG_DIR: directory,
    CLAUDE_PROJECT_DIR: project,
    CLAUDE_PLUGIN_OPTION_REPLIES: ''
  };
  const prompt = (text) => ({ session_id: 's1', cwd: directory, transcript_path: transcript, prompt: text });
  return { env, transcript, prompt };
}

function contextOf(result) {
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.hookEventName, 'UserPromptSubmit');
  return output.additionalContext;
}

test('a prompt no handler answers prints nothing', async () => {
  const { env, prompt } = await dispatchFixture();
  const result = await runDispatch(prompt('hello'), env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
});

test('one speaking handler prints its string alone', async () => {
  const { env, prompt } = await dispatchFixture();
  const context = contextOf(await runDispatch(prompt('?'), env));
  assert.match(context, /^The user sent a lone "\?"/);
  assert.doesNotMatch(context, /book --claim/);
});

test('nudge and expand-reply strings join in that order', async () => {
  const { env, prompt } = await dispatchFixture(JSON.stringify({ replies: 'terse' }));
  const context = contextOf(await runDispatch(prompt('no, that is wrong'), env));
  const nudgeAt = context.indexOf('exo: this prompt may correct a repository fact');
  const expandAt = context.indexOf('replies=terse:');
  assert.ok(nudgeAt >= 0, 'the nudge speaks');
  assert.ok(expandAt > nudgeAt, 'the reminder follows the nudge');
});

test('a fault in one handler leaves the others speaking', async () => {
  const { env, prompt } = await dispatchFixture('{ not json');
  const result = await runDispatch(prompt('no, that is wrong'), env);
  assert.match(contextOf(result), /book --claim/);
  assert.match(result.stderr, /dispatch-prompt: expand-reply:/);
});

test('malformed input exits 0 with nothing on stdout', async () => {
  const { env } = await dispatchFixture();
  const result = await runDispatch('{ not json', env);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});
