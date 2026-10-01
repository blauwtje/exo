// The heavy-command step wraps a command that starts a configured prefix in
// the heavy-run wrapper, leaves every other call alone, and carries the
// original command through the shell quoting unchanged.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-bash.mjs', import.meta.url));
const WRAPPER = fileURLToPath(new URL('../hooks/heavy-run.mjs', import.meta.url));

// Runs the Bash dispatcher in a project whose heavy_commands is `heavy` and
// returns its parsed hook output, or null when it prints nothing.
async function dispatch(command, { heavy, guards, session = 'session-1' } = {}) {
  const directory = await fixture();
  const settings = {};
  if (heavy !== undefined) settings.heavy_commands = heavy;
  if (guards !== undefined) settings.guards = guards;
  await fs.mkdir(path.join(directory, '.claude'));
  await fs.writeFile(path.join(directory, '.claude', 'exo.json'), JSON.stringify(settings));
  const input = JSON.stringify({ tool_name: 'Bash', session_id: session, tool_input: { command, timeout: 5000 } });
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
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
