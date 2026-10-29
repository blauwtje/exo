import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const REPOSITORY = fileURLToPath(new URL('../', import.meta.url));
const HOOKS = JSON.parse(fs.readFileSync(path.join(REPOSITORY, 'hooks', 'hooks.json'), 'utf8')).hooks;

const PAYLOADS = {
  SessionStart: { hook_event_name: 'SessionStart', source: 'startup', session_id: 'sidecall' },
  SubagentStart: { hook_event_name: 'SubagentStart', session_id: 'sidecall' },
  SessionEnd: { hook_event_name: 'SessionEnd', session_id: 'sidecall' },
  Stop: { hook_event_name: 'Stop', session_id: 'sidecall' },
  Bash: { hook_event_name: 'PreToolUse', session_id: 'sidecall', tool_name: 'Bash', tool_input: { command: 'find / -name x' } },
  Agent: { hook_event_name: 'PreToolUse', session_id: 'sidecall', tool_name: 'Agent', tool_input: { description: 'x', prompt: 'y' } },
  Edit: { hook_event_name: 'PreToolUse', session_id: 'sidecall', tool_name: 'Edit', tool_input: { file_path: '/tmp/x', old_string: 'a', new_string: 'b' } },
  Read: { hook_event_name: 'PreToolUse', session_id: 'sidecall', tool_name: 'Read', tool_input: { file_path: '/tmp/x' } },
  AskUserQuestion: { hook_event_name: 'PreToolUse', session_id: 'sidecall', tool_name: 'AskUserQuestion', tool_input: {} }
};

function entries() {
  return Object.entries(HOOKS).flatMap(([event, groups]) => groups.flatMap((group) => group.hooks.map((hook) => ({
    name: group.matcher ? `${event} ${group.matcher}` : event,
    command: hook.command,
    payload: PAYLOADS[group.matcher?.split('|')[0]] ?? PAYLOADS[event]
  }))));
}

function runHook(command, payload, environment) {
  return spawnSync('bash', ['-c', command], { input: JSON.stringify(payload), encoding: 'utf8', env: environment, timeout: 30_000 });
}

for (const { name, command, payload } of entries()) {
  test(`${name} hook prints nothing and exits 0 when TE_SIDECALL=1`, () => {
    const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sidecall-'));
    const environment = { ...process.env, CLAUDE_PLUGIN_ROOT: REPOSITORY, CLAUDE_CONFIG_DIR: configDirectory, TE_SIDECALL: '1' };
    const result = runHook(command, { ...payload, cwd: configDirectory }, environment);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(fs.readdirSync(configDirectory), []);
    fs.rmSync(configDirectory, { recursive: true, force: true });
  });
}

test('the SessionStart and SubagentStart hooks print text without TE_SIDECALL', () => {
  const configDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-sidecall-'));
  const environment = { ...process.env, CLAUDE_PLUGIN_ROOT: REPOSITORY, CLAUDE_CONFIG_DIR: configDirectory };
  delete environment.TE_SIDECALL;
  for (const name of ['SessionStart', 'SubagentStart']) {
    const { command } = entries().find((entry) => entry.name.startsWith(name));
    const result = runHook(command, { ...PAYLOADS[name], cwd: configDirectory }, environment);
    assert.notEqual(result.stdout, '', name);
  }
  fs.rmSync(configDirectory, { recursive: true, force: true });
});
