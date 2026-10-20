// The Agent hook fills model and effort for a general-purpose or claude helper that sets neither,
// and the budget setting defaults to balanced.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { agentEffort, agentHook } from '../hooks/agent-effort.mjs';
import { dispatchMarker, readDispatchRules } from '../hooks/dispatch-rules.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';
import { SCHEMA } from '../lib/settings-store.mjs';

const call = (input, budget = 'balanced') => agentEffort({ tool_name: 'Agent', tool_input: input }, budget)?.hookSpecificOutput.updatedInput;

test('the budget setting defaults to balanced', () => {
  assert.equal(SCHEMA.budget.default, 'balanced');
});

test('a general-purpose, claude or untyped call with no model or effort gets the unnamed kind', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'balanced' }).kinds[readKindTable().unnamed.kind];
  for (const type of ['general-purpose', 'claude', undefined]) {
    assert.deepEqual(call({ subagent_type: type, prompt: 'x' }), { subagent_type: type, prompt: 'x', model, effort });
  }
});

test('an explicit model or effort, an exo-kind line, off and other types leave the unnamed fill out', () => {
  assert.equal(call({ subagent_type: 'general-purpose', model: 'opus' }), undefined);
  assert.equal(call({ subagent_type: 'claude', effort: 'high' }), undefined);
  assert.equal(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup' }).model, 'haiku');
  assert.equal(call({ subagent_type: 'general-purpose' }, 'off'), undefined);
  for (const type of ['fork', 'Explore', 'claude-code-guide', 'statusline-setup']) assert.equal(call({ subagent_type: type }), undefined);
});

test('the first lead Agent call of a session gets the dispatch rules once, a subagent call none, and session start re-arms them', () => {
  delete process.env.EXO_RUN_DIR;
  const sessionId = `dispatch-test-${process.pid}-${Date.now()}`;
  const lead = { session_id: sessionId, tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } };
  const off = () => false;
  try {
    assert.equal(agentHook({ ...lead, agent_id: 'a1' }, 'balanced', off), null);
    assert.equal(agentHook(lead, 'balanced', off).hookSpecificOutput.additionalContext, readDispatchRules());
    assert.equal(agentHook(lead, 'balanced', off), null);
    execFileSync(process.execPath, [path.join(import.meta.dirname, '..', 'hooks', 'session-start.mjs')], { input: JSON.stringify({ session_id: sessionId, source: 'compact' }) });
    assert.equal(agentHook(lead, 'balanced', off).hookSpecificOutput.additionalContext, readDispatchRules());
  } finally {
    fs.rmSync(dispatchMarker(sessionId), { force: true });
  }
});

test('the session text keeps the fan-out line and leaves the dispatch-only rules out', () => {
  const sessionText = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  assert.match(sessionText, /one subagent for each part/);
  for (const line of readDispatchRules().split('\n')) assert.ok(!sessionText.includes(line.slice(2)), line);
});
