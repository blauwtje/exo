import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { tempDir } from './harness.mjs';

const HOOK = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'hooks', 'session-start.mjs');

function contextFor(source) {
  const home = tempDir('exo-session-source-');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  for (const name of ['CLAUDE_CONFIG_DIR', 'CODEX_HOME', 'EXO_HOST', 'EXO_RUN', 'EXO_RUN_DIR']) delete env[name];
  const run = spawnSync(process.execPath, [HOOK], { env, input: JSON.stringify({ session_id: 's1', source, cwd: home }), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).hookSpecificOutput.additionalContext;
}

const RULES = fs.readFileSync(path.join(path.dirname(HOOK), 'session-rules.md'), 'utf8').trimEnd();

test('startup, clear and compact inject the session rules', () => {
  for (const source of ['startup', 'clear', 'compact']) assert.ok(contextFor(source).includes(RULES), source);
});

test('resume prints no settings line for an empty config and drops not the rules its transcript already holds', () => {
  const context = contextFor('resume');
  assert.ok(!context.includes(RULES));
  assert.doesNotMatch(context, /exo settings/);
});

const ROUTING = fs.readFileSync(path.join(path.dirname(HOOK), 'session-routing.md'), 'utf8').trimEnd();

test('the static routing and rule text open the context and the dynamic pointers and settings follow', () => {
  for (const source of ['startup', 'clear', 'compact']) {
    const context = contextFor(source);
    assert.ok(context.startsWith(`${ROUTING}\n\n${RULES}`), source);
  }
});
