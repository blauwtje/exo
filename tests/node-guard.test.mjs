// Without Node on PATH every hook command used to exit 127 and exo's safety went
// off with no word to the user. Each hook command now tests for node first:
// SessionStart says once that the hooks are off, every other hook exits 0 and
// prints nothing. With node present the guard changes nothing.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const HOOKS = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'hooks', 'hooks.json'), 'utf8')).hooks;
const BASH = ['/bin/bash', '/usr/bin/bash'].find((candidate) => fs.existsSync(candidate));
const PRE_TOOL_USE_CALLS = 10;

function hookEntries() {
  const entries = [];
  for (const [event, groups] of Object.entries(HOOKS)) {
    for (const group of groups) {
      for (const hook of group.hooks) entries.push({ event, matcher: group.matcher, hook });
    }
  }
  return entries;
}

function runHook(hook, input, pathValue) {
  return spawnSync(BASH, ['-c', hook.command], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    timeout: 20000,
    env: { PATH: pathValue, CLAUDE_PLUGIN_ROOT: REPOSITORY, HOME: os.tmpdir() }
  });
}

function emptyPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'exo-no-node-'));
}

const SESSION_INPUT = { hook_event_name: 'SessionStart', source: 'startup', cwd: os.tmpdir(), session_id: 'node-guard' };
const BASH_INPUT = { hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'echo hi' }, cwd: os.tmpdir(), session_id: 'node-guard' };

test('every hook command tests for node first, runs under bash and stays shell form', () => {
  const entries = hookEntries();
  assert.ok(entries.length >= 7, `${entries.length} hook commands`);
  for (const { event, hook } of entries) {
    assert.equal(hook.shell, 'bash', `${event}: ${hook.command}`);
    assert.equal(hook.args, undefined, `${event}: args form`);
    assert.match(hook.command, /^command -v node >\/dev\/null 2>&1 \|\| /, `${event}: ${hook.command}`);
    assert.match(hook.command, /; node "\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/[^"]+\.mjs"$/, `${event}: ${hook.command}`);
  }
});

test('without node, SessionStart prints one systemMessage and exits 0', () => {
  const sessionStart = hookEntries().filter((entry) => entry.event === 'SessionStart');
  assert.equal(sessionStart.length, 1);
  const run = runHook(sessionStart[0].hook, SESSION_INPUT, emptyPath());
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stderr, '');
  const output = JSON.parse(run.stdout);
  assert.deepEqual(Object.keys(output), ['systemMessage']);
  assert.match(output.systemMessage, /Node 22/);
  assert.match(output.systemMessage, /safety hooks are off/);
  assert.equal(output.systemMessage.split('\n').length, 1);
});

test('without node, each PreToolUse and Stop hook exits 0 with no output over ten calls', () => {
  const silent = hookEntries().filter((entry) => entry.event !== 'SessionStart');
  assert.ok(silent.length >= 6, `${silent.length} silent hooks`);
  const bin = emptyPath();
  for (const { event, matcher, hook } of silent) {
    for (let call = 0; call < PRE_TOOL_USE_CALLS; call += 1) {
      const run = runHook(hook, BASH_INPUT, bin);
      const label = `${event} ${matcher ?? ''} call ${call}`;
      assert.equal(run.status, 0, `${label}: ${run.stderr}`);
      assert.equal(run.stdout, '', label);
      assert.equal(run.stderr, '', label);
    }
  }
});

test('with node on PATH, the guard leaves each hook result unchanged', () => {
  const nodeDirectory = path.dirname(process.execPath);
  const pathValue = [nodeDirectory, '/usr/bin', '/bin'].join(path.delimiter);
  const sessionStart = hookEntries().find((entry) => entry.event === 'SessionStart').hook;
  const dispatchBash = hookEntries().find((entry) => entry.matcher === 'Bash').hook;
  for (const [hook, input] of [[sessionStart, SESSION_INPUT], [dispatchBash, BASH_INPUT]]) {
    const guarded = runHook(hook, input, pathValue);
    const bare = runHook({ command: hook.command.slice(hook.command.lastIndexOf('; node "') + 2) }, input, pathValue);
    assert.equal(guarded.status, 0, guarded.stderr);
    assert.equal(guarded.status, bare.status, guarded.stderr);
    assert.equal(guarded.stdout, bare.stdout);
    assert.equal(guarded.stderr, bare.stderr);
    assert.doesNotMatch(guarded.stdout, /safety hooks are off/);
  }
});
