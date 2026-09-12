// The session hook hands the model the using-exo body, the right-sizing ladder
// and its guards included, so the ladder holds before every edit without a
// skill call. The savings switch does not reach it: it silences the counter,
// the status line segment and the read guard, and the ladder rides either way.

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

test('the session hook carries the right-sizing ladder whether exo savings are on or off', { skip: !(await jqAvailable()) && 'jq not on PATH' }, async () => {
  const configDirectory = await fixture();
  const on = await runHook({ CLAUDE_CONFIG_DIR: configDirectory });
  assert.equal(on.code, 0, on.stderr);
  const off = await runHook({ CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: 'off' });
  assert.equal(off.code, 0, off.stderr);
  for (const result of [on, off]) {
    const context = JSON.parse(result.stdout).hookSpecificOutput.additionalContext;
    assert.ok(context.includes('# Using exo'), context);
    for (const text of LADDER_TEXTS) assert.ok(context.includes(text), text);
    assert.ok(context.includes('are borrowed mid-turn and hand control back.'), context);
    // The frontmatter is dropped, so the description never reaches the context twice.
    assert.ok(!context.includes('name: using-exo'), context);
  }
});
