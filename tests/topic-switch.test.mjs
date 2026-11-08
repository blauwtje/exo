import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { contextHook } from '../hooks/context-limit.mjs';
import { skillTopic, topicSwitch } from '../lib/topic-switch.mjs';
import HOOKS from '../hooks/hooks.json' with { type: 'json' };

const OFF = () => false;
const skillCall = (session, skill, extra = {}) => ({ session_id: session, tool_name: 'Skill', tool_input: { skill }, ...extra });
const nudgeOf = (output) => output?.hookSpecificOutput?.additionalContext ?? null;

test('skillTopic groups the plan flow into one topic and ignores other skills', () => {
  assert.equal(skillTopic('exo:spec'), skillTopic('exo:ship'));
  assert.equal(skillTopic('exo:find-cause'), skillTopic('exo:build'));
  assert.equal(skillTopic('exo:watch'), 'watch');
  assert.equal(skillTopic('exo:save-session'), null);
  assert.equal(skillTopic('code-review'), null);
});

test('topicSwitch nudges only when both topics exist and differ', () => {
  assert.match(topicSwitch({ sessionTopic: 'flow', topic: 'watch' }).nudge, /watch work/);
  assert.equal(topicSwitch({ sessionTopic: 'flow', topic: 'flow' }).nudge, null);
  assert.deepEqual(topicSwitch({ sessionTopic: null, topic: 'flow' }), { topic: 'flow', nudge: null });
  assert.deepEqual(topicSwitch({ sessionTopic: 'flow', topic: null }), { topic: 'flow', nudge: null });
});

test('the Skill hook seeds the session topic, then nudges once on a switch', () => {
  const session = `topic-${randomUUID()}`;
  assert.equal(nudgeOf(contextHook(skillCall(session, 'exo:spec'), OFF)), null);
  assert.equal(nudgeOf(contextHook(skillCall(session, 'exo:build'), OFF)), null);
  assert.match(nudgeOf(contextHook(skillCall(session, 'exo:watch'), OFF)), /fresh session/);
  assert.equal(nudgeOf(contextHook(skillCall(session, 'exo:watch'), OFF)), null);
});

test('a subagent skill call neither nudges nor moves the lead topic', () => {
  const session = `topic-${randomUUID()}`;
  contextHook(skillCall(session, 'exo:build'), OFF);
  assert.equal(nudgeOf(contextHook(skillCall(session, 'exo:watch', { agent_id: 'a1' }), OFF)), null);
  assert.match(nudgeOf(contextHook(skillCall(session, 'exo:write-docs'), OFF)), /write-docs work/);
});

test('no UserPromptSubmit hook runs on every prompt', () => {
  assert.equal(HOOKS.hooks.UserPromptSubmit, undefined);
});
