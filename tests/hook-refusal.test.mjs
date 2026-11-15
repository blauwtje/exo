import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { SHARED_STATE_STEP } from '../lib/lazy-steps.mjs';
import { stallGuardInput } from '../hooks/run-stall-guard.mjs';
import { denyReason } from '../lib/guard-rules.mjs';
import { refusalText, rememberRefusal } from '../lib/hook-refusal.mjs';

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

test('dispatch-bash escalates three identical agent stash calls', async () => {
  const input = { session_id: session('bash'), agent_id: 'worker', tool_name: 'Bash', tool_input: { command: 'git stash' } };
  const reasons = await threeReasons(() => dispatchBash(input, [SHARED_STATE_STEP], off));
  assertEscalates(reasons, 'Do instead: ');
});

test('run-stall-guard escalates three identical land-task calls', async () => {
  const input = { session_id: session('stall'), tool_name: 'Bash', tool_input: { command: 'cd x && node land-task.mjs plan.md 1' } };
  const reasons = await threeReasons(() => stallGuardInput(input));
  assertEscalates(reasons, 'Do instead: ');
});

const deniedWith = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

test('a context hard limit refusal stays identical on every hit', () => {
  const input = { session_id: session('hard'), tool_name: 'Read', tool_input: { file_path: 'a' } };
  const reason = denyReason('context-hard', 'Over the 75k hard limit', { checkpoint: 'checkpoint.mjs' });
  const reasons = [1, 2, 3].map(() => reasonOf(rememberRefusal(input, deniedWith(reason), { guard: 'context-limit' })));
  assert.deepEqual(reasons, [reason, reason, reason]);
});

test('an output already remembered is not counted again', () => {
  const input = { session_id: session('once'), tool_name: 'Bash', tool_input: { command: 'x' } };
  const first = rememberRefusal(input, deniedWith(denyReason('stash')), { guard: 'g' });
  assert.equal(rememberRefusal(input, first, { guard: 'g' }), first);
  assert.match(reasonOf(rememberRefusal(input, deniedWith(denyReason('stash')), { guard: 'g' })), /refused once already/);
});

test('an allowed output passes unchanged', () => {
  const output = { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'note' } };
  assert.equal(rememberRefusal({ session_id: 's' }, output, { guard: 'g' }), output);
  assert.equal(rememberRefusal({ session_id: 's' }, null, { guard: 'g' }), null);
});

const refusalCall = (session, query = 'x  Reddit') => ({ session_id: session, tool_name: 'WebSearch', tool_input: { query } });
const refusalOptions = { guard: 'reddit', guardText: 'guard' };

test('another session or call starts at hit 1', () => {
  const session = `s-${process.pid}-c`;
  refusalText(refusalCall(session), refusalOptions);
  assert.equal(refusalText(refusalCall(`${session}x`), refusalOptions), 'guard');
  assert.equal(refusalText(refusalCall(session, 'other'), refusalOptions), 'guard');
});

test('a call without a session is not counted', () => {
  assert.equal(refusalText({ tool_name: 'WebSearch', tool_input: {} }, refusalOptions), 'guard');
  assert.equal(refusalText({ tool_name: 'WebSearch', tool_input: {} }, refusalOptions), 'guard');
});

test('three identical refused calls give three distinct outputs', () => {
  const session = `s-${process.pid}-d`;
  const outputs = [1, 2, 3].map(() => refusalText(refusalCall(session), refusalOptions));
  assert.equal(new Set(outputs).size, 3);
  assert.ok(outputs[1].includes('follow the first refusal: guard'));
  assert.match(outputs[2], /record the gap/);
});
