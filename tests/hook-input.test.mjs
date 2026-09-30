// Hook scripts read stdin as a stream, so a parent that writes late is not
// lost to EAGAIN, a missing stdin returns at once, and an input that never
// ends fails the read instead of hanging the hook.

import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOOK_INPUT_TIMEOUT_MS } from '../lib/hook-input.mjs';
import { environmentMs } from '../lib/script-flags.mjs';
import { fixture } from './harness.mjs';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const NUDGE = path.join(REPOSITORY, 'skills', 'remember', 'scripts', 'nudge.mjs');
const GUARD = path.join(REPOSITORY, 'hooks', 'guards', 'read-guard.mjs');
const READER = pathToFileURL(path.join(REPOSITORY, 'lib', 'hook-input.mjs')).href;
const WRITE_DELAY_MS = 200;
const OVER_CAP = Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n');

function runScript(script, args, input, { environment = {}, delayMs = 0 } = {}) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [script, ...args],
      { env: { ...process.env, ...environment }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    if (input === null) return;
    setTimeout(() => child.stdin.end(JSON.stringify(input)), delayMs);
  });
}

async function readerScript(directory, timeoutMs) {
  const file = path.join(directory, 'read.mjs');
  await fs.writeFile(
    file,
    `import { readHookText } from '${READER}';\n` +
      `try { process.stdout.write(JSON.stringify(await readHookText({ timeoutMs: ${timeoutMs} }))); }\n` +
      'catch (error) { process.stderr.write(error.message); process.exitCode = 1; }\n'
  );
  return file;
}

test('nudge prints its JSON when stdin is written late', async () => {
  const directory = await fixture();
  const input = { session_id: 's1', cwd: directory, prompt: 'no, the verifier reports 17 checks' };
  const result = await runScript(NUDGE, [], input, { environment: { CLAUDE_CONFIG_DIR: directory }, delayMs: WRITE_DELAY_MS });
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

test('read-guard denies an unbounded read of a large file when stdin is written late', async () => {
  const directory = await fixture();
  const file = path.join(directory, 'big.ts');
  await fs.writeFile(file, OVER_CAP);
  const input = { session_id: 's1', tool_name: 'Read', tool_use_id: 'toolu_1', tool_input: { file_path: file } };
  const result = await runScript(GUARD, [], input, { environment: { CLAUDE_CONFIG_DIR: directory }, delayMs: WRITE_DELAY_MS });
  assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('the reader returns an empty text at once when stdin is ignored', async () => {
  const file = await readerScript(await fixture(), 5000);
  const started = Date.now();
  const child = spawn(process.execPath, [file], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  await new Promise((resolve) => child.on('close', resolve));
  assert.equal(stdout, '""');
  assert.ok(Date.now() - started < 3000);
});

test('the reader rejects near timeoutMs when the pipe never ends, and the process exits', async () => {
  const file = await readerScript(await fixture(), 200);
  const child = spawn(process.execPath, [file], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const started = Date.now();
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 1);
  assert.match(stderr, /no end of hook input on stdin within 200 ms/);
  assert.ok(Date.now() - started < 5000);
});

test('a hook waits 10 s for its input by default, which only a positive integer override shortens', () => {
  assert.equal(HOOK_INPUT_TIMEOUT_MS, 10_000);
  assert.equal(environmentMs('EXO_TEST_UNSET_WAIT_MS', HOOK_INPUT_TIMEOUT_MS), HOOK_INPUT_TIMEOUT_MS);
  try {
    for (const text of ['', 'abc', '0', '-5', '1.5', '500ms']) {
      process.env.EXO_TEST_WAIT_MS = text;
      assert.equal(environmentMs('EXO_TEST_WAIT_MS', HOOK_INPUT_TIMEOUT_MS), HOOK_INPUT_TIMEOUT_MS, text);
    }
    process.env.EXO_TEST_WAIT_MS = '500';
    assert.equal(environmentMs('EXO_TEST_WAIT_MS', HOOK_INPUT_TIMEOUT_MS), 500);
  } finally {
    delete process.env.EXO_TEST_WAIT_MS;
  }
});

test('a guard given a pipe that never ends exits 1 with the read failure on stderr', async () => {
  const directory = await fixture();
  const child = spawn(process.execPath, [GUARD], {
    env: { ...process.env, CLAUDE_CONFIG_DIR: directory, EXO_READ_GUARD_INPUT_MS: '500' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const code = await new Promise((resolve) => child.on('close', resolve));
  assert.equal(code, 1);
  assert.match(stderr, /^read-guard: could not read hook input: no end of hook input on stdin within 500 ms/);
});

// The isTTY branch (return '' without waiting) is not exercised: a terminal
// cannot be spawned portably.
