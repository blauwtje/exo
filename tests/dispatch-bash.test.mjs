// The Bash dispatcher runs the five Bash guards, the delegate budget and the
// memory-booking approval in one process: it returns the first deny, joins the
// contexts of the other steps, lets a faulting step fall through, passes every
// other tool, and stands the guards down when the guards setting is off.

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

test('each guard denies through the dispatcher with its own text', async () => {
  const cases = [
    ['git reset --hard', /git-guard/],
    ['nohup sleep 1', /detach-guard/],
    ['git commit -m "feat: x" -m "Co-Authored-By: Claude <noreply@anthropic.com>"', /writing-guard/]
  ];
  for (const [command, pattern] of cases) {
    const decision = await output(command);
    assert.equal(decision.hookEventName, 'PreToolUse', command);
    assert.equal(decision.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, pattern, command);
  }
});

test('a guard denies a command inside bash -c and eval through the dispatcher', async () => {
  for (const command of [`bash -c "git reset --hard"`, `eval 'git reset --hard'`, `sh -c "bash -c 'git reset --hard'"`]) {
    const decision = await output(command);
    assert.equal(decision.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, /git-guard/, command);
  }
});

test('a command no step objects to produces no output', async () => {
  assert.equal(await output('git status'), null);
});

test('the memory-booking command is approved', async () => {
  const decision = await output(`node "${MEMORY_SCRIPT}" book --claim "a fact" --quote "the words" --session "s"`);
  assert.equal(decision.permissionDecision, 'allow');
});

test('a call that is not a Bash command, and input that is not usable, produce no output', async () => {
  const other = await dispatch({ tool_name: 'Read', tool_input: { command: 'git reset --hard' } });
  assert.deepEqual([other.code, other.stdout], [0, '']);
  const empty = await dispatch(null, { input: '' });
  assert.deepEqual([empty.code, empty.stdout], [0, '']);
  const broken = await dispatch(null, { input: '{ not json' });
  assert.deepEqual([broken.code, broken.stdout, broken.stderr], [0, '', '']);
});

test('the guards setting off stands the guards down', async () => {
  const command = 'git reset --hard';
  assert.match((await output(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'on' } })).permissionDecisionReason, /git-guard/);
  assert.equal(await output(command, { env: { CLAUDE_PLUGIN_OPTION_GUARDS: 'off' } }), null);
});

test('the first deny is returned when two guards deny', async () => {
  const decision = await output('git reset --hard & sleep 1');
  assert.match(decision.permissionDecisionReason, /git-guard/);
});

test('a deny wins over an allow, and contexts are joined in step order', async () => {
  const allow = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'ok' } };
  const steps = [step('a', allow), step('b', context('first')), step('c', deny('no one')), step('d', deny('no two')), step('e', context('second'))];
  assert.deepEqual(await dispatchBash({}, steps, []), {
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
  const denied = await dispatchBash({}, [broken, step('after', deny('still denied'))], []);
  assert.equal(denied.hookSpecificOutput.permissionDecisionReason, 'still denied');
  assert.equal(await dispatchBash({}, [broken, step('none', null)], []), null);
});

test('a denied call is not booked by the bookkeeping steps', async () => {
  let booked = 0;
  const counter = { name: 'counter', run: () => { booked += 1; return null; } };
  const refused = await dispatchBash({}, [step('guard', deny('no'))], [counter]);
  assert.equal(refused.hookSpecificOutput.permissionDecision, 'deny');
  assert.equal(booked, 0);
  assert.equal(await dispatchBash({}, [step('guard', null)], [counter]), null);
  assert.equal(booked, 1);
});

test('an awaited async step is merged like a sync one', async () => {
  const late = { name: 'late', run: async () => context('from the budget') };
  assert.deepEqual(await dispatchBash({}, [], [late]), {
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'from the budget' }
  });
  const broken = { name: 'broken', run: async () => { throw new Error('late boom'); } };
  assert.equal(await dispatchBash({}, [], [broken]), null);
});

// A Bash call from a delegate whose transcript is 120k tokens deep, run under `host`.
async function delegateCall(host) {
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
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, TMPDIR: directory, EXO_HOST: host }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput;
}

test('a Bash call inside a delegate past the hard limit is denied by the dispatcher', async () => {
  const decision = await delegateCall('claude');
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /BUDGET/);
});

test('on Codex the delegate budget step is skipped and every guard is kept', async () => {
  assert.equal(await delegateCall('codex'), null);
  const decision = await output('git reset --hard', { env: { EXO_HOST: 'codex' } });
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /git-guard/);
});

// A main-session transcript at 120k prompt tokens, which nothing measures.
async function mainSessionCall(command) {
  const directory = await fs.realpath(await fixture());
  const transcript = path.join(directory, 'session.jsonl');
  const usage = { input_tokens: 1000, cache_read_input_tokens: 115000, cache_creation_input_tokens: 4000, output_tokens: 700 };
  await fs.writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { id: 'msg-main', usage } })}\n`);
  const hookInput = { session_id: 's1', tool_name: 'Bash', tool_input: { command }, transcript_path: transcript, cwd: directory };
  const outcome = await run(DISPATCHER, [], {
    cwd: directory,
    input: JSON.stringify(hookInput),
    env: { CLAUDE_CONFIG_DIR: directory, CLAUDE_PROJECT_DIR: directory, TMPDIR: directory }
  });
  assert.equal(outcome.code, 0, outcome.stderr);
  return outcome.stdout === '' ? null : JSON.parse(outcome.stdout).hookSpecificOutput;
}

test('a main-session Bash call at 120k tokens gets no notice', async () => {
  assert.equal(await mainSessionCall('git status'), null);
});

test('a guard-denied main-session Bash call at 120k tokens prints only the deny', async () => {
  const decision = await mainSessionCall('git reset --hard');
  assert.equal(decision.permissionDecision, 'deny');
  assert.equal(decision.additionalContext, undefined);
});
