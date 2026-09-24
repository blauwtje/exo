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
import { HOOK_OUTPUT_CAP } from '#budgets';
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

function hotFile(configDirectory) {
  return path.join(configDirectory, 'exo', 'savings', 'sessions', 's1.json');
}

async function baseline(configDirectory) {
  const session = JSON.parse(await fs.readFile(hotFile(configDirectory), 'utf8'));
  return session.restate.baseline;
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
  await assert.rejects(fs.access(hotFile(configDirectory)));
});

test('with savings off nothing is measured and nothing is sent', async () => {
  const { env, configDirectory, prompt } = await restateFixture();
  const result = await runRestate([], prompt, { ...env, EXO_SAVINGS: 'off' });
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout, '');
  await assert.rejects(fs.access(recordFile(configDirectory)));
  await assert.rejects(fs.access(hotFile(configDirectory)));
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

const SESSION_HOOK = path.join(REPOSITORY, 'hooks', 'session-start.sh');

function jqAvailable() {
  return new Promise((resolve) => execFile('jq', ['--version'], (error) => resolve(!error)));
}

const withoutJq = (await jqAvailable()) ? false : 'jq is not on PATH';

function runSessionHook(hookInput, env, hook = SESSION_HOOK) {
  return new Promise((resolve) => {
    const child = execFile('bash', [hook], { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify(hookInput));
  });
}

test('every session start moves the measuring point and still prints one JSON object', { skip: withoutJq }, async () => {
  const { env, configDirectory, transcript, prompt } = await restateFixture();
  await runRestate([], prompt, env);
  const grown = START_BYTES + RESTATE_INTERVAL_BYTES;
  await growTo(transcript, grown);
  const started = await runSessionHook({ session_id: 's1', transcript_path: transcript, source: 'resume' }, env);
  assert.equal(started.code, 0, started.stderr);
  assert.equal(JSON.parse(started.stdout).hookSpecificOutput.hookEventName, 'SessionStart');
  assert.equal(await baseline(configDirectory), grown);
});

test('a long working directory keeps both pointers and cuts only the tail of the rules', { skip: withoutJq }, async () => {
  const { env, configDirectory, transcript } = await restateFixture();
  const pluginRoot = await fixture();
  for (const directory of ['hooks', 'skills', 'lib']) {
    await fs.cp(path.join(REPOSITORY, directory), path.join(pluginRoot, directory), { recursive: true });
  }
  await fs.copyFile(path.join(REPOSITORY, 'package.json'), path.join(pluginRoot, 'package.json'));
  // The committed body sits far under the cap, so the copy is padded past it.
  await fs.appendFile(path.join(pluginRoot, RESTATED_SKILL), `${'x'.repeat(12000)}\n`);
  const scope = 'w'.repeat(240);
  const workingDirectory = path.join(configDirectory, scope);
  await fs.mkdir(workingDirectory);
  await fs.mkdir(path.join(configDirectory, 'exo', 'handoff'), { recursive: true });
  await fs.writeFile(path.join(configDirectory, 'exo', 'handoff', `${scope}.md`), 'handoff\n');
  await fs.mkdir(path.join(configDirectory, 'exo', 'memory', scope), { recursive: true });
  await fs.writeFile(path.join(configDirectory, 'exo', 'memory', scope, 'memory.md'), 'memory\n');
  const started = await runSessionHook({ session_id: 's1', transcript_path: transcript, source: 'startup', cwd: workingDirectory }, env, path.join(pluginRoot, 'hooks', 'session-start.sh'));
  assert.equal(started.code, 0, started.stderr);
  const injected = JSON.parse(started.stdout).hookSpecificOutput.additionalContext;
  assert.ok(injected.length <= HOOK_OUTPUT_CAP.chars, `the hook printed ${injected.length} characters`);
  const handoffPointer = `A handoff for \`${scope}\` sits at \`${path.join(configDirectory, 'exo', 'handoff', `${scope}.md`)}\`.`;
  const memoryPointer = `A project memory for this repository sits at \`${path.join(configDirectory, 'exo', 'memory', scope, 'memory.md')}\`.`;
  assert.ok(injected.startsWith(handoffPointer), injected.slice(0, 400));
  assert.ok(injected.includes(memoryPointer), injected.slice(0, 900));
  assert.match(injected, /## Before acting/);
  assert.match(injected, /exo settings:/);
  assert.doesNotMatch(started.stderr, /pointer left out/);
  assert.match(started.stderr, new RegExp(`^exo: using-exo cut by \\d+ characters, the session context would pass ${HOOK_OUTPUT_CAP.chars}$`, 'm'));
  const hook = await fs.readFile(SESSION_HOOK, 'utf8');
  assert.match(hook, new RegExp(`^output_cap=${HOOK_OUTPUT_CAP.chars}$`, 'm'));
});
