import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refusalText } from '../lib/refusal-memory.mjs';

const call = (session, query = 'x  Reddit') => ({ session_id: session, tool_name: 'WebSearch', tool_input: { query } });
const options = { guard: 'reddit', guardText: 'guard' };

test('another session or call starts at hit 1', () => {
  const session = `s-${process.pid}-c`;
  refusalText(call(session), options);
  assert.equal(refusalText(call(`${session}x`), options), 'guard');
  assert.equal(refusalText(call(session, 'other'), options), 'guard');
});

test('a call without a session is not counted', () => {
  assert.equal(refusalText({ tool_name: 'WebSearch', tool_input: {} }, options), 'guard');
  assert.equal(refusalText({ tool_name: 'WebSearch', tool_input: {} }, options), 'guard');
});

test('three identical refused calls give three distinct outputs', () => {
  const session = `s-${process.pid}-d`;
  const outputs = [1, 2, 3].map(() => refusalText(call(session), options));
  assert.equal(new Set(outputs).size, 3);
  assert.ok(outputs[1].length <= 160);
  assert.match(outputs[2], /record the gap/);
});
