import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { MAX_TIMEOUT_MS, shellQuote, stallGuardInput } from '../hooks/run-stall-guard.mjs';
import { claudeArgs } from '../skills/build/scripts/run-session.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const HOOK = path.join(ROOT, 'hooks', 'run-stall-guard.mjs');
const GUARD = path.join(ROOT, 'lib', 'stall-guard.mjs');

const bash = (tool_input) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input });
const updated = (output) => output.hookSpecificOutput.updatedInput;

test('shellQuote wraps in single quotes and escapes each embedded quote', () => {
  assert.equal(shellQuote('npm test'), "'npm test'");
  assert.equal(shellQuote("echo 'hi'"), "'echo '\\''hi'\\'''");
  assert.equal(shellQuote('echo $(id) `id` "x"'), "'echo $(id) `id` \"x\"'");
});

test('the hook wraps a Bash command in the stall guard and keeps the other fields', () => {
  const output = stallGuardInput(bash({ command: 'npm test', description: 'run tests' }));
  assert.equal(output.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(updated(output).command, `node "${GUARD}" -- 'npm test'`);
  assert.equal(updated(output).description, 'run tests');
  assert.equal(updated(output).timeout, MAX_TIMEOUT_MS);
});

test('the hook caps a longer timeout at 600000 and keeps a shorter one', () => {
  assert.equal(updated(stallGuardInput(bash({ command: 'a', timeout: 3_600_000 }))).timeout, 600000);
  assert.equal(updated(stallGuardInput(bash({ command: 'a', timeout: 30_000 }))).timeout, 30000);
});

test('the hook never decides permission, so the allow and deny rules still apply', () => {
  assert.equal(stallGuardInput(bash({ command: 'git push' })).hookSpecificOutput.permissionDecision, undefined);
});

test('the hook leaves other tools, empty commands and exo scripts alone', () => {
  assert.equal(stallGuardInput({ tool_name: 'Read', tool_input: { file_path: '/x' } }), null);
  assert.equal(stallGuardInput(bash({ command: '' })), null);
  assert.equal(stallGuardInput(bash({})), null);
  assert.equal(stallGuardInput(bash({ command: `node "${ROOT}/skills/verify/scripts/verify.mjs" --plan p` })), null);
});

test('a wrapped command with quotes runs as the original and keeps its exit code', () => {
  const output = stallGuardInput(bash({ command: "echo 'a b'; exit 3" }));
  const result = spawnSync('bash', ['-c', updated(output).command], { encoding: 'utf8' });
  assert.equal(result.stdout, 'a b\n');
  assert.equal(result.status, 3);
});

test('the hook script reads stdin and prints the JSON output', () => {
  const result = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(bash({ command: 'ls' })), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(updated(JSON.parse(result.stdout)).command, `node "${GUARD}" -- 'ls'`);
});

test('claudeArgs adds the PreToolUse Bash hook only when asked and keeps the other settings', () => {
  const base = { model: 'm', effort: 'e', allow: [] };
  assert.ok(!claudeArgs(base).includes('--settings'));
  const args = claudeArgs({ ...base, settings: { sandbox: { enabled: true } }, stallGuard: true });
  const settings = JSON.parse(args[args.indexOf('--settings') + 1]);
  assert.deepEqual(settings.sandbox, { enabled: true });
  const [entry] = settings.hooks.PreToolUse;
  assert.equal(entry.matcher, 'Bash');
  assert.equal(entry.hooks[0].type, 'command');
  assert.equal(entry.hooks[0].command, `node "${HOOK}"`);
  const alone = claudeArgs({ ...base, stallGuard: true });
  assert.equal(JSON.parse(alone[alone.indexOf('--settings') + 1]).hooks.PreToolUse.length, 1);
});
