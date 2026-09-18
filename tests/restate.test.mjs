// The restatement hook stays silent until the transcript has grown one
// interval past the point where the rules were last injected, then sends the
// text lib/restatement.mjs builds, once. A fault never blocks a prompt.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { RESTATED_SKILL, RESTATE_INTERVAL_BYTES, restatementText } from '#restatement';
import { fixture } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const RESTATE = path.join(REPOSITORY, 'skills', 'savings', 'scripts', 'restate.mjs');
const START_BYTES = 1000;

function runRestate(args, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [RESTATE, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
  });
}

async function restateFixture() {
  const configDirectory = await fixture();
  const transcript = path.join(configDirectory, 'transcript.jsonl');
  await fs.writeFile(transcript, 'x'.repeat(START_BYTES));
  const env = { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: '', EXO_SAVINGS_DIR: '' };
  const prompt = { session_id: 's1', transcript_path: transcript, prompt: 'deploy with the token hunter2' };
  return { env, configDirectory, transcript, prompt };
}

function growTo(transcript, bytes) {
  return fs.writeFile(transcript, 'x'.repeat(bytes));
}

function recordFile(configDirectory) {
  return path.join(configDirectory, 'exo', 'savings', 'sessions.json');
}

async function baseline(configDirectory) {
  const sessions = JSON.parse(await fs.readFile(recordFile(configDirectory), 'utf8'));
  return sessions.s1.restate.baseline;
}

test('the first prompt starts measuring and sends nothing', async () => {
  const { env, configDirectory, prompt } = await restateFixture();
  const result = await runRestate([], prompt, env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await baseline(configDirectory), START_BYTES);
});

test('a session shorter than the interval receives no additionalContext', async () => {
  const { env, configDirectory, transcript, prompt } = await restateFixture();
  await runRestate([], prompt, env);
  await growTo(transcript, START_BYTES + RESTATE_INTERVAL_BYTES - 1);
  const result = await runRestate([], prompt, env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(await baseline(configDirectory), START_BYTES);
});

test('one interval of growth sends the text built from the skill file, once', async () => {
  const { env, configDirectory, transcript, prompt } = await restateFixture();
  await runRestate([], prompt, env);
  const grown = START_BYTES + RESTATE_INTERVAL_BYTES;
  await growTo(transcript, grown);
  const result = await runRestate([], prompt, env);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  const skillText = await fs.readFile(path.join(REPOSITORY, RESTATED_SKILL), 'utf8');
  assert.equal(output.hookEventName, 'UserPromptSubmit');
  assert.equal(output.additionalContext, restatementText(skillText));
  assert.equal(await baseline(configDirectory), grown);
  const next = await runRestate([], prompt, env);
  assert.equal(next.stdout, '');
});

test('a reset moves the measuring point, so the grown transcript stays silent', async () => {
  const { env, configDirectory, transcript, prompt } = await restateFixture();
  await runRestate([], prompt, env);
  const grown = START_BYTES + RESTATE_INTERVAL_BYTES;
  await growTo(transcript, grown);
  await runRestate(['reset'], { session_id: 's1', transcript_path: transcript, source: 'compact' }, env);
  assert.equal(await baseline(configDirectory), grown);
  const result = await runRestate([], prompt, env);
  assert.equal(result.stdout, '');
});

test('a transcript smaller than the measuring point starts measuring again', async () => {
  const { env, configDirectory, transcript, prompt } = await restateFixture();
  await runRestate([], prompt, env);
  await growTo(transcript, 10);
  const result = await runRestate([], prompt, env);
  assert.equal(result.stdout, '');
  assert.equal(await baseline(configDirectory), 10);
});

test('a delegate prompt is not measured', async () => {
  const { env, configDirectory, prompt } = await restateFixture();
  const result = await runRestate([], { ...prompt, agent_id: 'a1' }, env);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.access(recordFile(configDirectory)));
});

test('with savings off nothing is measured and nothing is sent', async () => {
  const { env, configDirectory, prompt } = await restateFixture();
  const result = await runRestate([], prompt, { ...env, EXO_SAVINGS: 'off' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.access(recordFile(configDirectory)));
});

test('a fault exits 0 with nothing on stdout', async () => {
  const { env } = await restateFixture();
  const malformed = await runRestate([], 'not json', env);
  assert.equal(malformed.code, 0);
  assert.equal(malformed.stdout, '');
  const withoutTranscript = await runRestate([], { session_id: 's1' }, env);
  assert.equal(withoutTranscript.code, 0);
  assert.equal(withoutTranscript.stdout, '');
});
