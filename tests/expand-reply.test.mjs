// The expand-reply hook restates the last reply in full on a lone `?` prompt
// and stays silent on every other prompt or malformed input.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const EXPAND_REPLY = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'expand-reply.mjs');

function runExpandReply(input) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [EXPAND_REPLY],
      { timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.on('error', () => {});
    child.stdin.end(typeof input === 'string' ? input : JSON.stringify(input));
  });
}

test('a lone question mark prints one additionalContext string', async () => {
  const result = await runExpandReply({ session_id: 's1', prompt: '?' });
  assert.equal(result.code, 0);
  const output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.equal(typeof output.hookSpecificOutput.additionalContext, 'string');
  assert.match(output.hookSpecificOutput.additionalContext, /last reply in full/);
});

test('surrounding whitespace around the question mark still counts', async () => {
  const result = await runExpandReply({ prompt: '  ?\n' });
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.hookEventName, 'UserPromptSubmit');
});

for (const prompt of ['??', 'why?', '? why', 'what is this?', '', 'hello']) {
  test(`the prompt ${JSON.stringify(prompt)} prints nothing`, async () => {
    const result = await runExpandReply({ prompt });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
  });
}

test('input without a string prompt prints nothing', async () => {
  const result = await runExpandReply({ session_id: 's1' });
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});

test('malformed input exits 0 with nothing on stdout', async () => {
  const result = await runExpandReply('not json');
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});
