import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentHook } from '../hooks/agent-effort.mjs';
import { contextHook } from '../hooks/context-limit.mjs';
import { SLEEP_STEP, dispatchBash } from '../hooks/dispatch-bash.mjs';
import { stallGuardInput } from '../hooks/run-stall-guard.mjs';
import { denyReason } from '../lib/guard-rules.mjs';
import { rememberRefusal } from '../lib/hook-refusal.mjs';

const off = () => false;
const session = (name) => `${name}-${process.pid}-${Date.now()}`;
const reasonOf = (output) => output.hookSpecificOutput.permissionDecisionReason;

async function threeReasons(run) {
  const reasons = [];
  for (const hit of [1, 2, 3]) reasons.push(reasonOf(await run(hit)));
  return reasons;
}

function assertEscalates([guard, reminder, stop], route) {
  assert.doesNotMatch(guard, /refused once already/);
  assert.match(reminder, /refused once already/);
  assert.ok(reminder.includes(route), reminder);
  assert.doesNotMatch(reminder, /\.\.$/);
  assert.match(stop, /record the gap/);
}

test('dispatch-bash escalates three identical agent shell waits', async () => {
  const input = { session_id: session('bash'), agent_id: 'worker', tool_name: 'Bash', tool_input: { command: 'sleep 30' } };
  const reasons = await threeReasons(() => dispatchBash(input, [SLEEP_STEP], off));
  assertEscalates(reasons, 'Do instead: ');
});

test('agent-effort escalates three identical oversized orchestrator calls', async () => {
  const input = { session_id: session('agent'), tool_name: 'Agent', tool_input: { subagent_type: 'exo:orchestrator', description: 'd', prompt: 'Workers: 99\nReads: none' } };
  const reasons = await threeReasons(() => agentHook(input, undefined, off));
  assertEscalates(reasons, 'Do instead: ');
});

test('run-stall-guard escalates three identical land-task calls', async () => {
  const input = { session_id: session('stall'), tool_name: 'Bash', tool_input: { command: 'cd x && node land-task.mjs plan.md 1' } };
  const reasons = await threeReasons(() => stallGuardInput(input));
  assertEscalates(reasons, 'Do instead: ');
});

test('context-limit still escalates a repeated Reddit call', async () => {
  const input = { session_id: session('reddit'), tool_name: 'WebFetch', tool_input: { url: 'https://www.reddit.com/r/neovim/' } };
  const [guard, reminder, stop] = await threeReasons(() => contextHook(input, off));
  assert.match(guard, /Reddit blocks this call/);
  assert.match(reminder, /refused once already/);
  assert.match(stop, /record the gap/);
});

const deniedWith = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

test('a context hard limit refusal stays identical on every hit', () => {
  const input = { session_id: session('hard'), tool_name: 'Read', tool_input: { file_path: 'a' } };
  const reason = denyReason('context-hard', 'Over the 75k hard limit', { checkpoint: 'checkpoint.mjs' });
  const reasons = [1, 2, 3].map(() => reasonOf(rememberRefusal(input, deniedWith(reason), { guard: 'context-limit' })));
  assert.deepEqual(reasons, [reason, reason, reason]);
});

test('a run-no-wait block stays identical on every hit', () => {
  const input = { session_id: session('wait'), hook_event_name: 'Stop' };
  const reason = denyReason('run-no-wait', 'record the choice');
  const reasons = [1, 2, 3].map(() => rememberRefusal(input, { decision: 'block', reason }, { guard: 'run-no-wait' }).reason);
  assert.deepEqual(reasons, [reason, reason, reason]);
});

test('an output already remembered is not counted again', () => {
  const input = { session_id: session('once'), tool_name: 'Bash', tool_input: { command: 'x' } };
  const first = rememberRefusal(input, deniedWith(denyReason('wide-find')), { guard: 'g' });
  assert.equal(rememberRefusal(input, first, { guard: 'g' }), first);
  assert.match(reasonOf(rememberRefusal(input, deniedWith(denyReason('wide-find')), { guard: 'g' })), /refused once already/);
});

test('an allowed output passes unchanged', () => {
  const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'note' } };
  assert.equal(rememberRefusal({ session_id: 's' }, output, { guard: 'g' }), output);
  assert.equal(rememberRefusal({ session_id: 's' }, null, { guard: 'g' }), null);
});
