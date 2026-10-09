// The expand-reply hook restates the last reply in full on a lone `?` prompt
// and stays silent otherwise or on malformed input.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const EXPAND_REPLY = path.join(REPOSITORY, 'skills', 'configure', 'scripts', 'expand-reply.mjs');

// An empty project and config directory keep the caller's own settings out of the run.
const EMPTY_DIRECTORY = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-reply-'));

function runExpandReply(input, project = EMPTY_DIRECTORY) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, CLAUDE_CONFIG_DIR: EMPTY_DIRECTORY, CLAUDE_PLUGIN_OPTION_COMPRESSION: '' };
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [EXPAND_REPLY],
      { timeout: 30_000, env },
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

test('an unparseable project exo.json prints nothing and exits 0', async () => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'expand-reply-project-'));
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.json'), '{ not json');
  const result = await runExpandReply({ prompt: 'hello' }, project);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
});
