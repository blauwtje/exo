// The session hook hands the model the using-exo body and, while exo savings
// are on, the right-sizing ladder and its guards in the same context string,
// so the ladder holds before every edit without a skill call and is booked
// with the rest of exo's session text; with savings off the ladder stays out,
// so the switch silences the ladder, the counter, the status line and the
// guard together.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const HOOK = fileURLToPath(new URL('../hooks/session-start.sh', import.meta.url));
const LADDER_TEXTS = ['## The ladder', '## Never on the ladder', 'edit in the same turn'];

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

test('the session hook carries the right-sizing ladder only while exo savings are on', { skip: !(await jqAvailable()) && 'jq not on PATH' }, async () => {
  const configDirectory = await fixture();
  const on = await runHook({ CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(on.code, 0, on.stderr);
  const onContext = JSON.parse(on.stdout).hookSpecificOutput.additionalContext;
  assert.ok(onContext.includes('# Using exo'), onContext);
  for (const text of LADDER_TEXTS) assert.ok(onContext.includes(text), text);
  assert.ok(!onContext.includes('## Report'), onContext);
  assert.ok(!onContext.includes('is borrowed before the first edit'), onContext);
  const off = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' });
  assert.equal(off.code, 0, off.stderr);
  const offContext = JSON.parse(off.stdout).hookSpecificOutput.additionalContext;
  for (const text of LADDER_TEXTS) assert.ok(!offContext.includes(text), text);
  assert.ok(offContext.includes('are borrowed mid-turn and hand control back.'), offContext);
});
