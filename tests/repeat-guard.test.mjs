// The repeat guard denies the third identical Bash command and the third edit
// replacing the same text in one file, lets the first repeat through, books
// each denial under its tool call, forgets its calls on a reset, and stands
// down when config.json says repeatGuard: false.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const GUARD = fileURLToPath(new URL('../skills/savings/scripts/repeat-guard.mjs', import.meta.url));
const READ_GUARD = fileURLToPath(new URL('../skills/savings/scripts/read-guard.mjs', import.meta.url));

function runScript(script, args, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [script, ...args],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput));
  });
}

function runGuard(args, hookInput, env) {
  return runScript(GUARD, args, hookInput, env);
}

async function guardFixture(config = null) {
  const configDirectory = await fixture();
  if (config !== null) {
    await fs.mkdir(path.join(configDirectory, 'exo', 'savings'), { recursive: true });
    await fs.writeFile(path.join(configDirectory, 'exo', 'savings', 'config.json'), JSON.stringify(config));
  }
  return { env: { CLAUDE_CONFIG_DIR: configDirectory, EXO_SAVINGS: '' }, configDirectory };
}

function bashInput(command, toolUseId) {
  return { session_id: 's1', tool_name: 'Bash', tool_use_id: toolUseId, tool_input: { command } };
}

function editInput(filePath, oldString, toolUseId) {
  return { session_id: 's1', tool_name: 'Edit', tool_use_id: toolUseId, tool_input: { file_path: filePath, old_string: oldString, new_string: 'next' } };
}

async function record(configDirectory) {
  return JSON.parse(await fs.readFile(path.join(configDirectory, 'exo', 'savings', 'sessions.json'), 'utf8'));
}

function decision(result) {
  return result.stdout === '' ? null : JSON.parse(result.stdout).hookSpecificOutput;
}

test('the first repeat passes and the third identical command is denied with its count', async () => {
  const { env, configDirectory } = await guardFixture();
  const first = await runGuard([], bashInput('npm test', 'toolu_1'), env);
  const second = await runGuard([], bashInput('npm  test', 'toolu_2'), env);
  assert.equal(first.code, 0, first.stderr);
  assert.equal(decision(first), null);
  assert.equal(decision(second), null);
  const third = await runGuard([], bashInput('npm test', 'toolu_3'), env);
  const verdict = decision(third);
  assert.equal(verdict.hookEventName, 'PreToolUse');
  assert.equal(verdict.permissionDecision, 'deny');
  assert.match(verdict.permissionDecisionReason, /has already run 2 times unchanged/);
  const session = (await record(configDirectory)).s1;
  assert.deepEqual(session.guard.denials, { toolu_3: { tool: 'Bash', reader: 'main', attempts: 3 } });
});

test('a log redirect that changes does not make a command a different one', async () => {
  const { env } = await guardFixture();
  await runGuard([], bashInput('npm run check > .git/a.log', 'toolu_1'), env);
  await runGuard([], bashInput('npm run check > .git/b.log', 'toolu_2'), env);
  const third = await runGuard([], bashInput('npm run check', 'toolu_3'), env);
  assert.match(decision(third).permissionDecisionReason, /^exo repeat guard:/);
});

test('the third edit replacing the same text in one file is denied, other text is not', async () => {
  const { env } = await guardFixture();
  const target = '/repo/app.ts';
  await runGuard([], editInput(target, 'alpha', 'toolu_1'), env);
  await runGuard([], editInput(target, 'alpha', 'toolu_2'), env);
  const other = await runGuard([], editInput(target, 'beta', 'toolu_3'), env);
  assert.equal(decision(other), null);
  const third = await runGuard([], editInput(target, 'alpha', 'toolu_4'), env);
  assert.match(decision(third).permissionDecisionReason, /already replaced the same text in \/repo\/app\.ts 2 times/);
});

test('an edit between runs of the same test lets the third run through', async () => {
  const { env } = await guardFixture();
  const reader = { agent_id: 'impl1' };
  assert.equal(decision(await runGuard([], { ...bashInput('npm test -- tests/a.test.mjs > .git/run-1.log', 'toolu_1'), ...reader }, env)), null);
  await runGuard([], { ...editInput('/repo/a.mjs', 'return 1', 'toolu_2'), ...reader }, env);
  assert.equal(decision(await runGuard([], { ...bashInput('npm test -- tests/a.test.mjs > .git/run-2.log', 'toolu_3'), ...reader }, env)), null);
  await runGuard([], { ...editInput('/repo/a.mjs', 'const y', 'toolu_4'), ...reader }, env);
  const third = await runGuard([], { ...bashInput('npm test -- tests/a.test.mjs > .git/run-3.log', 'toolu_5'), ...reader }, env);
  assert.equal(decision(third), null);
});

test('a write between runs of the same command lets the third run through', async () => {
  const { env } = await guardFixture();
  await runGuard([], bashInput('npm test', 'toolu_1'), env);
  await runGuard([], bashInput('npm test', 'toolu_2'), env);
  await runGuard([], { session_id: 's1', tool_name: 'Write', tool_use_id: 'toolu_3', tool_input: { file_path: '/repo/a.mjs', content: 'x' } }, env);
  assert.equal(decision(await runGuard([], bashInput('npm test', 'toolu_4'), env)), null);
});

test('an edit by another reader leaves the counts of this reader standing', async () => {
  const { env } = await guardFixture();
  await runGuard([], bashInput('npm test', 'toolu_1'), env);
  await runGuard([], bashInput('npm test', 'toolu_2'), env);
  await runGuard([], { ...editInput('/repo/a.mjs', 'alpha', 'toolu_3'), agent_id: 'impl1' }, env);
  const third = await runGuard([], bashInput('npm test', 'toolu_4'), env);
  assert.match(decision(third)?.permissionDecisionReason ?? '', /has already run 2 times unchanged/);
});

test('a reset forgets the calls of the context window that ended', async () => {
  const { env, configDirectory } = await guardFixture();
  await runGuard([], bashInput('git status', 'toolu_1'), env);
  await runGuard([], bashInput('git status', 'toolu_2'), env);
  await runGuard(['reset'], { session_id: 's1', source: 'compact' }, env);
  assert.deepEqual((await record(configDirectory)).s1.calls, {});
  const afterReset = await runGuard([], bashInput('git status', 'toolu_3'), env);
  assert.equal(decision(afterReset), null);
});

test('repeatGuard false stands this guard down while the read guard keeps refusing', async () => {
  const { env, configDirectory } = await guardFixture({ repeatGuard: false });
  await runGuard([], bashInput('npm test', 'toolu_1'), env);
  await runGuard([], bashInput('npm test', 'toolu_2'), env);
  const third = await runGuard([], bashInput('npm test', 'toolu_3'), env);
  assert.equal(decision(third), null);
  const big = path.join(configDirectory, 'big.ts');
  await fs.writeFile(big, Array.from({ length: 600 }, (_, index) => `line ${index + 1}`).join('\n'));
  const read = await runScript(READ_GUARD, [], { session_id: 's1', tool_name: 'Read', tool_use_id: 'toolu_4', tool_input: { file_path: big } }, env);
  assert.match(decision(read).permissionDecisionReason, /^exo read guard:/);
});

test('EXO_SAVINGS=off denies nothing', async () => {
  const { env } = await guardFixture();
  const off = { ...env, EXO_SAVINGS: 'off' };
  await runGuard([], bashInput('npm test', 'toolu_1'), off);
  await runGuard([], bashInput('npm test', 'toolu_2'), off);
  const third = await runGuard([], bashInput('npm test', 'toolu_3'), off);
  assert.equal(decision(third), null);
});

test('a malformed payload exits 0 with no output and does not block the call', async () => {
  const { env } = await guardFixture();
  const result = await runGuard([], 'not json', env);
  assert.equal(result.code, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /^repeat-guard:/);
});
