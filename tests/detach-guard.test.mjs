// The detach guard denies a Bash launch that backgrounds a process with `&`,
// `nohup`, `disown` or `setsid`, reads only the words that run, passes every
// other tool, and stands down when the guards setting is off.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../hooks/guards/detach-guard.mjs', import.meta.url));

async function guard(hookInput, { env = {}, input = JSON.stringify(hookInput) } = {}) {
  const directory = await fixture();
  return run(GUARD, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, ...env }
  });
}

async function reason(command, options) {
  const outcome = await guard({ tool_name: 'Bash', tool_input: { command } }, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  if (outcome.stdout === '') return null;
  const { hookSpecificOutput } = JSON.parse(outcome.stdout);
  assert.equal(hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(hookSpecificOutput.permissionDecision, 'deny');
  return hookSpecificOutput.permissionDecisionReason;
}

test('a background ampersand is denied and the reason names run_in_background', async () => {
  for (const command of [
    'npm run dev &',
    'npm run dev & echo started',
    'cd app && node server.js &',
    'sleep 5 &\nwait'
  ]) {
    assert.match(await reason(command), /detach-guard.*run_in_background/, command);
  }
});

test('nohup, disown and setsid are denied wherever a command starts', async () => {
  for (const command of [
    'nohup node server.js',
    'cd app && nohup node server.js',
    'sudo setsid node server.js',
    'node server.js; disown',
    '(setsid node server.js)',
    'echo ok\nnohup node server.js'
  ]) {
    assert.match(await reason(command), /detach-guard/, command);
  }
});

test('operators that are not a background launch pass', async () => {
  for (const command of [
    'npm ci && npm test',
    'make 2>&1 | tee build.log',
    'make |& tee build.log',
    'node script.mjs &> out.log',
    'ls missing >&2',
    'npm test'
  ]) {
    assert.equal(await reason(command), null, command);
  }
});

test('an ampersand or a detach word in quoted text or a heredoc body passes', async () => {
  for (const command of [
    'echo "a & b"',
    "echo 'run it with nohup'",
    'git commit -m "fix: stop using setsid & nohup"',
    'cat <<EOF\nrun nohup node x &\nEOF',
    'grep -n "disown" notes.md',
    'echo nohuprun setsidfoo'
  ]) {
    assert.equal(await reason(command), null, command);
  }
});

test('a substitution inside a double-quoted string still runs', async () => {
  assert.match(await reason('echo "$(nohup node server.js)"'), /detach-guard/);
});

test('other tools and empty input pass', async () => {
  const edit = await guard({ tool_name: 'Edit', tool_input: { command: 'npm run dev &' } });
  assert.deepEqual([edit.code, edit.stdout], [0, '']);
  assert.equal(await reason(''), null);
  const empty = await guard(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
});

test('the guards setting off stands the guard down', async () => {
  const command = 'npm run dev &';
  assert.match(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } }), /detach-guard/);
  assert.equal(await reason(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('an unreadable settings file leaves the guard on', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), '{ broken');
  const outcome = await run(GUARD, [], {
    cwd: directory,
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'nohup node server.js' } }),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
  assert.match(outcome.stdout, /detach-guard/);
});

test('input that is not JSON is a non-blocking error with no decision', async () => {
  const broken = await guard(null, { input: '{ not json' });
  assert.equal(broken.code, 1);
  assert.match(broken.stderr, /detach-guard: cannot read the hook input/);
  assert.equal(broken.stdout, '');
});
