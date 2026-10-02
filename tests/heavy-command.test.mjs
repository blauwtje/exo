// The heavy-command step wraps a command that starts a configured prefix in
// the heavy-run wrapper, leaves every other call alone, and carries the
// original command through the shell quoting unchanged. A command the runtime
// log holds as learned for the project is wrapped too, and a test-like command
// that is not wrapped has its start booked there.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-bash.mjs', import.meta.url));
const WRAPPER = fileURLToPath(new URL('../hooks/heavy-run.mjs', import.meta.url));

let lastCache;

// Runs the Bash dispatcher in a project whose heavy_commands is `heavy` and
// returns its parsed hook output, or null when it prints nothing.
async function dispatch(command, { heavy, guards, after, suite, learned, learnedSeconds = 90, session = 'session-1', cache } = {}) {
  const directory = await fixture();
  cache ??= path.join(directory, 'cache');
  const settings = {};
  if (heavy !== undefined) settings.heavy_commands = heavy;
  if (guards !== undefined) settings.guards = guards;
  if (after !== undefined) settings.heavy_after_seconds = after;
  if (suite !== undefined) settings.subagent_suite_after_seconds = suite;
  if (learned !== undefined) {
    await fs.mkdir(cache, { recursive: true });
    const entries = Object.fromEntries(learned.map((text) => [text, { seconds: learnedSeconds, lastUsed: new Date().toISOString() }]));
    await fs.writeFile(path.join(cache, 'runtimes.json'), JSON.stringify({ learned: { [directory]: entries }, starts: {} }));
  }
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), JSON.stringify(settings));
  const input = JSON.stringify({ tool_name: 'Bash', session_id: session, tool_input: { command, timeout: 5000 } });
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, EXO_HEAVY_CACHE: cache }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  lastCache = cache;
  return outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput;
}

test('a command starting a heavy prefix is wrapped with the session id and no permission decision', async () => {
  const output = await dispatch('npm run e2e:beeld', { heavy: 'npm run e2e', session: 'abc-123' });
  assert.equal(output.permissionDecision, undefined);
  assert.equal(output.updatedInput.timeout, 5000);
  assert.equal(output.updatedInput.command, `node '${WRAPPER}' --session 'abc-123' -- 'npm run e2e:beeld'`);
});

test('a segment after && || ; or | matches, and the whole command is wrapped', async () => {
  for (const command of ['cd app && npm run e2e', 'false || npm run e2e', 'echo a; npm run e2e', 'echo a | npm run e2e']) {
    const output = await dispatch(command, { heavy: 'make slow; npm run e2e' });
    assert.ok(output.updatedInput.command.endsWith(`-- '${command}'`), command);
  }
});

test('a command with an environment assignment in front, another command and an empty setting are not wrapped', async () => {
  assert.equal(await dispatch('EXO_HEAVY_FORCE=1 npm run e2e', { heavy: 'npm run e2e' }), null);
  assert.equal(await dispatch('npm run lint', { heavy: 'npm run e2e' }), null);
  assert.equal(await dispatch('echo npm run e2e', { heavy: 'npm run e2e' }), null);
  assert.equal(await dispatch('npm run e2e', { heavy: '' }), null);
  assert.equal(await dispatch('npm run e2e', {}), null);
});

test('the guards setting off does not switch the wrapper off', async () => {
  const output = await dispatch('npm run e2e', { heavy: 'npm run e2e', guards: 'off' });
  assert.match(output.updatedInput.command, /heavy-run\.mjs/);
});

test('a command an earlier step rewrote is wrapped as rewritten', async () => {
  const output = await dispatch('npm run build', { heavy: 'npm run build' });
  assert.ok(output.updatedInput.command.endsWith(`-- 'set -o pipefail; npm run build 2>&1 | tail -n 200'`));
});

test('a faulting step or an unreadable setting lets the command through unchanged', async () => {
  const directory = await fixture();
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), '{ not json');
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'npm run e2e' } });
  const outcome = await run(DISPATCHER, [], { cwd: directory, input, env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory } });
  assert.deepEqual([outcome.code, outcome.stdout], [0, '']);
});

test('a command with single quotes, spaces and a dollar sign runs through the wrapper unchanged', async () => {
  const original = `echo 'it'"'"'s $HOME' "two  words" '' && printf '%s\\n' "a'b"`;
  const output = await dispatch(original, { heavy: 'echo' });
  const directory = await fixture();
  const env = { ...process.env, EXO_HEAVY_CACHE: path.join(directory, 'cache') };
  const direct = execFileSync('bash', ['-c', original], { cwd: directory, env, encoding: 'utf8' });
  const wrapped = execFileSync('bash', ['-c', output.updatedInput.command], { cwd: directory, env, encoding: 'utf8' });
  assert.equal(wrapped, direct);
  assert.match(wrapped, /it's \$HOME/);
});

test('a learned command is wrapped, a similar or unlearned one is not', async () => {
  const output = await dispatch('make verify', { learned: ['make verify'] });
  assert.match(output.updatedInput.command, /heavy-run\.mjs.*-- 'make verify'$/);
  assert.equal(await dispatch('make verify X=1', { learned: ['make verify'] }), null);
  assert.equal(await dispatch('make lint', { learned: ['make verify'] }), null);
});

test('a learned command recorded under a threshold since raised is not wrapped', async () => {
  assert.equal(await dispatch('make verify', { learned: ['make verify'], after: 300 }), null);
});

test('a learned watch-mode command and a learned command with learning off are not wrapped', async () => {
  assert.equal(await dispatch('make verify --watch', { learned: ['make verify --watch'] }), null);
  assert.equal(await dispatch('make verify', { learned: ['make verify'], after: 0 }), null);
});

test('a test-like command that is not wrapped has its start booked, others do not', async () => {
  await dispatch('make lint', { session: 'booked' });
  const log = JSON.parse(await fs.readFile(path.join(lastCache, 'runtimes.json'), 'utf8'));
  assert.deepEqual(Object.keys(log.starts), ['booked']);
  assert.deepEqual(Object.keys(log.starts.booked), ['make lint']);
  for (const options of [{ command: 'ls' }, { command: 'make verify --watch' }, { command: 'make lint', after: 0, suite: 0 }, { command: 'make lint', heavy: 'make lint' }]) {
    await dispatch(options.command, options);
    await assert.rejects(fs.readFile(path.join(lastCache, 'runtimes.json')), options.command);
  }
});

test('a start is booked with learning off while the suite guard is on', async () => {
  assert.equal(await dispatch('make lint', { session: 'suite', after: 0, suite: 20 }), null);
  const log = JSON.parse(await fs.readFile(path.join(lastCache, 'runtimes.json'), 'utf8'));
  assert.deepEqual(Object.keys(log.starts.suite), ['make lint']);
});

test('a learned 33 s test command is not wrapped at the default 60', async () => {
  assert.equal(await dispatch('make verify', { learned: ['make verify'], learnedSeconds: 33 }), null);
});
