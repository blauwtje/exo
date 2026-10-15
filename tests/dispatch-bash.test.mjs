import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { fixture, run } from './harness.mjs';

const DISPATCHER = fileURLToPath(new URL('../hooks/dispatch-bash.mjs', import.meta.url));
const MEMORY_SCRIPT = fileURLToPath(new URL('../skills/remember/scripts/memory.mjs', import.meta.url));

async function dispatch(hookInput, { env = {}, input = JSON.stringify(hookInput) } = {}) {
  const directory = await fixture();
  return run(DISPATCHER, [], {
    cwd: directory,
    input,
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, ...env }
  });
}

async function output(command, options) {
  const outcome = await dispatch({ tool_name: 'Bash', tool_input: { command } }, options);
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput;
}

const step = (name, result) => ({ name, run: () => result });
const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });
const context = (text) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } });

test('a command no step objects to produces no output', async () => {
  assert.equal(await output('git status'), null);
});

test('the memory-booking command is no longer approved', async () => {
  assert.equal(await output(`node "${MEMORY_SCRIPT}" book --claim "a fact" --quote "the words" --session "s"`), null);
});

test('a call that is not a Bash command, and input that is not usable, produce no output', async () => {
  const other = await dispatch({ tool_name: 'Read', tool_input: { command: 'docker volume rm data' } });
  assert.deepEqual([other.code, other.stdout], [0, '']);
  const empty = await dispatch(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
  const broken = await dispatch(null, { input: '{ not json' });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});

test('a deny wins over an allow, and contexts are joined in step order', async () => {
  const allow = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'ok' } };
  const steps = [step('a', allow), step('b', context('first')), step('c', deny('no one')), step('d', deny('no two')), step('e', context('second'))];
  assert.deepEqual(await dispatchBash({}, steps), {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: 'no one',
      additionalContext: 'first\nsecond'
    }
  });
});

test('a step that throws does not stop the steps after it', async () => {
  const broken = { name: 'broken', run: () => { throw new Error('boom'); } };
  const denied = await dispatchBash({}, [broken, step('after', deny('still denied'))]);
  assert.equal(denied.hookSpecificOutput.permissionDecisionReason, 'still denied');
  assert.equal(await dispatchBash({}, [broken, step('none', null)]), null);
});

test('an awaited async step is merged like a sync one', async () => {
  const late = { name: 'late', run: async () => context('from the budget') };
  assert.deepEqual(await dispatchBash({}, [late]), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'from the budget' }
  });
  const broken = { name: 'broken', run: async () => { throw new Error('late boom'); } };
  assert.equal(await dispatchBash({}, [broken]), null);
});

// A Bash call from a delegate whose transcript is 120k tokens deep.
async function delegateCall() {
  const directory = await fixture();
  const transcript = path.join(directory, 'session.jsonl');
  const subagents = path.join(directory, 'session', 'subagents');
  await fs.mkdir(subagents, { recursive: true });
  const usage = { input_tokens: 120000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 };
  const line = JSON.stringify({ type: 'assistant', message: { role: 'assistant', usage } });
  await fs.writeFile(path.join(subagents, 'agent-dispatch-test.jsonl'), `${line}\n`);
  const hookInput = { tool_name: 'Bash', tool_input: { command: 'ls' }, agent_id: 'dispatch-test', agent_type: 'general-purpose', transcript_path: transcript };
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify(hookInput),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, TMPDIR: directory }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput;
}

test('a Bash call inside a delegate 120k tokens deep is denied with the report instruction', async () => {
  const decision = await delegateCall();
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /end now with your report/);
});

test('a destructive command passes the dispatcher, on Codex too', async () => {
  assert.equal(await output('docker volume rm data'), null);
  assert.equal(await output('docker volume rm data', { env: { EXO_HOST: 'codex' } }), null);
});

test('a main-session Bash call at 120k tokens produces no output', async () => {
  const directory = await fs.realpath(await fixture());
  const transcript = path.join(directory, 'session.jsonl');
  const usage = { input_tokens: 1000, cache_read_input_tokens: 115000, cache_creation_input_tokens: 4000, output_tokens: 700 };
  await fs.writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { id: 'msg-main', usage } })}\n`);
  const hookInput = { session_id: 's1', tool_name: 'Bash', tool_input: { command: 'git status' }, transcript_path: transcript, cwd: directory };
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify(hookInput),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, TMPDIR: directory }
  });
  assert.deepEqual([outcome.code, outcome.stdout, outcome.stderr], [0, '', '']);
});

test('a Codex-shaped input without a transcript gets no context output', async () => {
  assert.equal(await output('git status', { env: { EXO_HOST: 'codex' } }), null);
});
