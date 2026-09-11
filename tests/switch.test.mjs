// The session hook hands the model the using-exo body; with exo savings off
// it drops the sentence that borrows the right-sizing ladder, so the switch
// silences the ladder, the counter, the status line and the guard together.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const HOOK = fileURLToPath(new URL('../hooks/session-start.sh', import.meta.url));
const LADDER_SENTENCE = 'is borrowed before the first edit that adds or replaces code';

function runHook(env) {
  return new Promise((resolve) => {
    const child = execFile('bash', [HOOK], { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) }));
    child.stdin.end(JSON.stringify({ session_id: 's1', source: 'startup' }));
  });
}

function jqAvailable() {
  return new Promise((resolve) => execFile('jq', ['--version'], (error) => resolve(!error)));
}

test('the session hook drops the ladder sentence when exo savings are off', { skip: !(await jqAvailable()) && 'jq not on PATH' }, async () => {
  const configDirectory = await fixture();
  const on = await runHook({ CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(on.code, 0, on.stderr);
  assert.ok(JSON.parse(on.stdout).hookSpecificOutput.additionalContext.includes(LADDER_SENTENCE));
  const off = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' });
  assert.equal(off.code, 0, off.stderr);
  const context = JSON.parse(off.stdout).hookSpecificOutput.additionalContext;
  assert.ok(!context.includes(LADDER_SENTENCE), context);
  assert.ok(context.includes('are borrowed mid-turn and hand control back.'), context);
});
