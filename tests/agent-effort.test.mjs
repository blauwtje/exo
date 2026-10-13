// The Agent hook raises only the open-point agent, only to xhigh or max, and
// keeps every other field of the dispatch.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentEffort, agentHook } from '../hooks/agent-effort.mjs';

const HOOK = fileURLToPath(new URL('../hooks/agent-effort.mjs', import.meta.url));
const toolInput = { subagent_type: 'exo:find-open-points', prompt: 'find', description: 'd' };
const input = (level, overrides = {}) => ({ tool_name: 'Agent', tool_input: toolInput, effort: { level }, ...overrides });
const updated = (hookInput, budget) => agentEffort(hookInput, budget)?.hookSpecificOutput.updatedInput;

test('xhigh and max raise the dispatch and keep its other fields', () => {
  for (const level of ['xhigh', 'max']) {
    assert.deepEqual(agentEffort(input(level), 'off'), {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...toolInput, effort: level } }
    });
  }
});

test('a dispatch effort at or above the session level is kept', () => {
  for (const [dispatch, level] of [['max', 'xhigh'], ['xhigh', 'xhigh'], ['max', 'max']]) {
    assert.equal(agentEffort(input(level, { tool_input: { ...toolInput, effort: dispatch } }), 'off'), null, `${dispatch} in ${level}`);
  }
  assert.equal(updated(input('max', { tool_input: { ...toolInput, effort: 'xhigh' } }), 'off').effort, 'max');
});

test('other levels, agents and tools print nothing under off', () => {
  for (const level of ['low', 'medium', 'high', undefined, 'bogus']) assert.equal(agentEffort(input(level), 'off'), null, String(level));
  assert.equal(agentEffort(input('max', { tool_input: { ...toolInput, subagent_type: 'exo:other' } }), 'off'), null);
  assert.equal(agentEffort(input('max', { tool_input: { prompt: 'x' } }), 'off'), null);
  assert.equal(agentEffort(input('max', { tool_name: 'Bash' }), 'fast'), null);
  assert.equal(agentEffort({}, 'fast'), null);
});

test('off leaves a review dispatch unchanged', () => {
  const review = { subagent_type: 'exo:review-branch', prompt: 'review', description: 'd' };
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: review }, 'off'), null);
});

test('an agent name fills model and effort from the budget column', () => {
  const lookup = { subagent_type: 'exo:locate-code', prompt: 'find', description: 'd' };
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: lookup }, 'fast'), { ...lookup, model: 'haiku', effort: 'low' });
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: lookup }, 'quality'), { ...lookup, model: 'haiku', effort: 'high' });
});

test('a prompt opening exo-kind picks the kind for a general-purpose dispatch', () => {
  const general = { subagent_type: 'general-purpose', prompt: 'exo-kind: hardest\nsolve it', description: 'd' };
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: general }, 'fast'), { ...general, model: 'opus', effort: 'medium' });
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: general }, 'quality'), { ...general, model: 'opus', effort: 'xhigh' });
});

test('a model or effort the call already sets is kept', () => {
  const lookup = { subagent_type: 'exo:locate-code', prompt: 'find', description: 'd', model: 'sonnet' };
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: lookup }, 'fast'), { ...lookup, effort: 'low' });
  const both = { ...lookup, effort: 'high' };
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: both }, 'fast'), null);
});

test('the raised effort counts as set and the model is still filled', () => {
  const result = updated(input('max'), 'fast');
  assert.equal(result.effort, 'max');
  assert.ok(result.model);
});

test('inherit sets no model and a null effort sets none', () => {
  const handover = { subagent_type: 'general-purpose', prompt: 'exo-kind: handover\nwrite', description: 'd' };
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: handover }, 'balanced'), null);
  const peer = { subagent_type: 'general-purpose', prompt: 'exo-kind: peer\nask', description: 'd' };
  assert.deepEqual(updated({ tool_name: 'Agent', tool_input: peer }, 'balanced'), { ...peer, effort: 'high' });
});

test('an unknown agent, kind or budget returns null', () => {
  const other = { subagent_type: 'exo:other', prompt: 'x', description: 'd' };
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: other }, 'fast'), null);
  const unknownKind = { subagent_type: 'general-purpose', prompt: 'exo-kind: nope\nx', description: 'd' };
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: unknownKind }, 'fast'), null);
  assert.equal(agentEffort({ tool_name: 'Agent', tool_input: { ...other, subagent_type: 'exo:locate-code' } }, 'bogus'), null);
});

function projectWithBudget(budget) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-budget-'));
  fs.mkdirSync(path.join(root, '.claude'));
  fs.writeFileSync(path.join(root, '.claude', 'exo.json'), JSON.stringify({ budget }));
  return root;
}

test('the script prints the output for max and nothing for garbage, empty input or an unknown agent', () => {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: projectWithBudget('fast') };
  const run = (text) => execFileSync(process.execPath, [HOOK], { input: text, env }).toString();
  assert.equal(JSON.parse(run(JSON.stringify(input('max')))).hookSpecificOutput.updatedInput.effort, 'max');
  assert.ok(JSON.parse(run(JSON.stringify(input('high')))).hookSpecificOutput.updatedInput.model);
  assert.equal(run('not json'), '');
  assert.equal(run(''), '');
  assert.equal(run(JSON.stringify(input('high', { tool_input: { ...toolInput, subagent_type: 'exo:other' } }))), '');
});

function transcript(tokens) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ctx-')), 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  return file;
}

test('the context check joins the raise, the lead dispatches at the hard limit, and a subagent context deny beats the allow', () => {
  const warned = agentHook(input('max', { transcript_path: transcript(65000) }), 'off').hookSpecificOutput;
  assert.equal(warned.permissionDecision, 'allow');
  assert.equal(warned.updatedInput.effort, 'max');
  assert.match(warned.additionalContext, /fresh subagent/);
  const lead = agentHook(input('max', { transcript_path: transcript(120000) }), 'off').hookSpecificOutput;
  assert.equal(lead.permissionDecision, 'allow');
  assert.equal(lead.updatedInput.effort, 'max');
  const denied = agentHook(input('max', { agent_id: 'a1', agent_transcript_path: transcript(120000) }), 'off').hookSpecificOutput;
  assert.equal(denied.permissionDecision, 'deny');
  assert.equal(denied.updatedInput, undefined);
  const alone = agentHook(input('high', { transcript_path: transcript(65000) }), 'off').hookSpecificOutput;
  assert.equal(alone.permissionDecision, undefined);
  assert.match(alone.additionalContext, /Context use/);
  assert.equal(agentHook(input('high', { transcript_path: transcript(1000) }), 'off'), null);
});
