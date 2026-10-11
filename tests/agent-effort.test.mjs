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

test('xhigh and max raise the dispatch and keep its other fields', () => {
  for (const level of ['xhigh', 'max']) {
    assert.deepEqual(agentEffort(input(level)), {
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...toolInput, effort: level } }
    });
  }
});

test('a dispatch effort at or above the session level is kept', () => {
  for (const [dispatch, level] of [['max', 'xhigh'], ['xhigh', 'xhigh'], ['max', 'max']]) {
    assert.equal(agentEffort(input(level, { tool_input: { ...toolInput, effort: dispatch } })), null, `${dispatch} in ${level}`);
  }
  assert.equal(agentEffort(input('max', { tool_input: { ...toolInput, effort: 'xhigh' } })).hookSpecificOutput.updatedInput.effort, 'max');
});

test('other levels, agents and tools print nothing', () => {
  for (const level of ['low', 'medium', 'high', undefined, 'bogus']) assert.equal(agentEffort(input(level)), null, String(level));
  assert.equal(agentEffort(input('max', { tool_input: { ...toolInput, subagent_type: 'exo:other' } })), null);
  assert.equal(agentEffort(input('max', { tool_input: { prompt: 'x' } })), null);
  assert.equal(agentEffort(input('max', { tool_name: 'Bash' })), null);
  assert.equal(agentEffort({}), null);
});

test('the script prints the output for max and nothing for garbage or empty input', () => {
  const run = (text) => execFileSync(process.execPath, [HOOK], { input: text }).toString();
  assert.equal(JSON.parse(run(JSON.stringify(input('max')))).hookSpecificOutput.updatedInput.effort, 'max');
  assert.equal(run('not json'), '');
  assert.equal(run(''), '');
  assert.equal(run(JSON.stringify(input('high'))), '');
});

function transcript(tokens) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-ctx-')), 't.jsonl');
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  return file;
}

test('the context check joins the raise, the lead dispatches at the hard limit, and a subagent context deny beats the allow', () => {
  const warned = agentHook(input('max', { transcript_path: transcript(65000) })).hookSpecificOutput;
  assert.equal(warned.permissionDecision, 'allow');
  assert.equal(warned.updatedInput.effort, 'max');
  assert.match(warned.additionalContext, /fresh subagent/);
  const lead = agentHook(input('max', { transcript_path: transcript(120000) })).hookSpecificOutput;
  assert.equal(lead.permissionDecision, 'allow');
  assert.equal(lead.updatedInput.effort, 'max');
  const denied = agentHook(input('max', { agent_id: 'a1', agent_transcript_path: transcript(120000) })).hookSpecificOutput;
  assert.equal(denied.permissionDecision, 'deny');
  assert.equal(denied.updatedInput, undefined);
  const alone = agentHook(input('high', { transcript_path: transcript(65000) })).hookSpecificOutput;
  assert.equal(alone.permissionDecision, undefined);
  assert.match(alone.additionalContext, /Context use/);
  assert.equal(agentHook(input('high', { transcript_path: transcript(1000) })), null);
});
