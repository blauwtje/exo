import assert from 'node:assert/strict';
import { test } from 'node:test';

const { dispatchEdit } = await import('../hooks/dispatch-edit.mjs');

let counter = 0;
const session = () => `lead-write-${process.pid}-${counter++}`;
const write = (sessionId, file, extra = {}) => ({ hook_event_name: 'PreToolUse', session_id: sessionId, tool_name: 'Write', tool_input: { file_path: file, content: 'x\n' }, ...extra });
const nudge = (input) => dispatchEdit(input)?.hookSpecificOutput?.additionalContext ?? '';
const NUDGE = /exo:build/;

test('the third distinct file written by the main session returns the nudge, earlier ones do not', () => {
  const id = session();
  assert.doesNotMatch(nudge(write(id, '/tmp/a.txt')), NUDGE);
  assert.doesNotMatch(nudge(write(id, '/tmp/b.txt')), NUDGE);
  assert.match(nudge(write(id, '/tmp/c.txt')), NUDGE);
  assert.doesNotMatch(nudge(write(id, '/tmp/d.txt')), NUDGE);
});

test('a repeat of a counted file does not advance the count', () => {
  const id = session();
  nudge(write(id, '/tmp/a.txt'));
  nudge(write(id, '/tmp/a.txt'));
  assert.doesNotMatch(nudge(write(id, '/tmp/b.txt')), NUDGE);
  assert.match(nudge(write(id, '/tmp/c.txt')), NUDGE);
});

test('subagent calls and .exo paths are not counted', () => {
  const id = session();
  nudge(write(id, '/tmp/a.txt'));
  nudge(write(id, '/tmp/b.txt'));
  assert.doesNotMatch(nudge(write(id, '/tmp/c.txt', { agent_id: 'agent-1' })), NUDGE);
  assert.doesNotMatch(nudge(write(id, '/repo/.exo/notes.md')), NUDGE);
  assert.match(nudge(write(id, '/tmp/d.txt')), NUDGE);
});
