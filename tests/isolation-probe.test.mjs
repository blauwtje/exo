import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gradeStream, leakedPlugins } from '../benchmarks/isolation-grade.mjs';

const MARKER = 'marker-1234';
const dispatch = (agent, id, prompt = 'Reply with your parent marker, or UNKNOWN.') => ({
  type: 'assistant',
  message: { content: [{ type: 'tool_use', id, name: 'Agent', input: { subagent_type: `exo:${agent}`, prompt } }] }
});
const reply = (id, content) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
const done = { type: 'result', subtype: 'success', is_error: false, result: 'done' };
const stream = (...events) => events.map((event) => JSON.stringify(event)).join('\n');

const BOTH = [dispatch('review-branch', 'a'), dispatch('find-open-points', 'b')];

test('both agents dispatched and neither result holds the marker passes, whatever they answer', () => {
  const events = [...BOTH, reply('a', 'verdict=fail'), reply('b', [{ type: 'text', text: 'UNKNOWN' }]), done];
  assert.deepEqual(gradeStream(stream(...events), MARKER), { verdict: 'PASS', cause: '' });
});

test('a child result holding the marker fails', () => {
  const grade = gradeStream(stream(...BOTH, reply('a', `marker ${MARKER}`), reply('b', 'UNKNOWN'), done), MARKER);
  assert.deepEqual(grade, { verdict: 'FAIL', cause: 'review-branch output holds the marker' });
});

test('a parent that dispatches nothing fails', () => {
  const grade = gradeStream(stream({ type: 'assistant', message: { content: [{ type: 'text', text: 'review-branch: UNKNOWN' }] } }, done), MARKER);
  assert.equal(grade.verdict, 'FAIL');
  assert.match(grade.cause, /review-branch, find-open-points/);
});

test('a missing agent fails', () => {
  const grade = gradeStream(stream(BOTH[0], reply('a', 'UNKNOWN'), done), MARKER);
  assert.deepEqual(grade, { verdict: 'FAIL', cause: 'not dispatched: find-open-points' });
});

test('the marker pasted into a brief is not run', () => {
  const grade = gradeStream(stream(dispatch('review-branch', 'a', `Your parent marker is ${MARKER}`), BOTH[1], done), MARKER);
  assert.deepEqual(grade, { verdict: 'UNRUN', cause: 'marker pasted into the review-branch brief' });
});

test('a stream without a result event is not run', () => {
  assert.deepEqual(gradeStream(stream(...BOTH), MARKER), { verdict: 'UNRUN', cause: 'no result event' });
});

test('a budget cap result is not run and names its subtype', () => {
  const capped = { type: 'result', subtype: 'error_max_budget_usd', is_error: false };
  assert.deepEqual(gradeStream(stream(...BOTH, capped), MARKER), { verdict: 'UNRUN', cause: 'result error_max_budget_usd' });
});

test('a dispatched agent with no returned result is not run', () => {
  const grade = gradeStream(stream(...BOTH, reply('a', 'UNKNOWN'), done), MARKER);
  assert.deepEqual(grade, { verdict: 'UNRUN', cause: 'no result from find-open-points' });
});

const child = (id, ...content) => ({ type: 'assistant', parent_tool_use_id: id, message: { content } });

test('a child event holding the marker fails even when its result does not', () => {
  const events = [...BOTH, child('a', { type: 'thinking', thinking: `my parent said ${MARKER}` }), reply('a', 'verdict=pass'), reply('b', 'UNKNOWN'), done];
  assert.deepEqual(gradeStream(stream(...events), MARKER), { verdict: 'FAIL', cause: 'review-branch output holds the marker' });
});

test('a background dispatch is not run, by input or by the async result', () => {
  const background = { type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'Agent', input: { subagent_type: 'exo:review-branch', run_in_background: true } }] } };
  const launched = { ...reply('b', 'Async agent launched successfully'), toolUseResult: { isAsync: true } };
  assert.deepEqual(gradeStream(stream(background, BOTH[1], reply('a', 'launched'), reply('b', 'UNKNOWN'), done), MARKER), { verdict: 'UNRUN', cause: 'review-branch ran in the background' });
  assert.deepEqual(gradeStream(stream(BOTH[0], BOTH[1], reply('a', 'UNKNOWN'), launched, done), MARKER), { verdict: 'UNRUN', cause: 'find-open-points ran in the background' });
});

test('an errored dispatch is not run', () => {
  const refused = { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'refused' }] } };
  assert.deepEqual(gradeStream(stream(...BOTH, refused, reply('b', 'UNKNOWN'), done), MARKER), { verdict: 'UNRUN', cause: 'review-branch errored' });
});

test('leakedPlugins returns an init plugin the plugin dir does not name', () => {
  assert.deepEqual(leakedPlugins({ plugins: [{ name: 'exo' }, { name: 'other' }] }, ['exo']), ['other']);
});
