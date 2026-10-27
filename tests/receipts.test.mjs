// Receipts: a user-only `systemMessage` line when an exo skill starts, an exo agent is dispatched or
// a call is refused. The model's context (`hookSpecificOutput`) must stay as it was.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { agentHook } from '../hooks/agent-effort.mjs';
import { contextHook, receiptsOn } from '../hooks/context-limit.mjs';
import { dispatchBash } from '../hooks/dispatch-bash.mjs';
import { dispatchEdit } from '../hooks/dispatch-edit.mjs';

const REPOSITORY = path.resolve(import.meta.dirname, '..');
const ON = () => true;
const OFF = () => false;
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'exo-receipts-'));

function transcript(tokens) {
  const file = path.join(WORK, `t${tokens}.jsonl`);
  fs.writeFileSync(file, `${JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: tokens } } })}\n`);
  return file;
}

// A subagent over the hard limit is denied by the context hook, whatever the tool.
const refused = (tool, toolInput = {}) => ({ session_id: 'receipts', agent_id: 'a1', agent_transcript_path: transcript(10_000_000), tool_name: tool, tool_input: toolInput });
const skill = (name) => ({ tool_name: 'Skill', tool_input: { skill: name } });

test('an exo skill start gives one user-only line and no model context', () => {
  const output = contextHook(skill('exo:spec'), ON);
  assert.deepEqual(output, { systemMessage: 'exo › spec' });
  assert.equal(output.hookSpecificOutput, undefined);
});

test('a skill that is not exo, and tools that are not skills, give no line', () => {
  assert.equal(contextHook(skill('other:spec'), ON), null);
  assert.equal(contextHook(skill('spec'), ON), null);
  assert.equal(contextHook({ tool_name: 'Read', tool_input: { file_path: '/x' } }, ON), null);
});

test('an exo agent dispatch shows its name with the model and effort it will run with', () => {
  const output = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code', prompt: 'x' } }, 'on', ON);
  assert.match(output.systemMessage, /^exo › locate-code \(\w+, \w+\)$/);
  assert.equal(output.hookSpecificOutput.updatedInput.subagent_type, 'exo:locate-code');
});

test('an exo agent with a model and effort already set shows those', () => {
  const input = { subagent_type: 'exo:build-task', model: 'opus', effort: 'high' };
  assert.equal(agentHook({ tool_name: 'Agent', tool_input: input }, 'off', ON).systemMessage, 'exo › build-task (opus, high)');
});

test('an agent that is not an exo agent gives no line, and no output when nothing changes', () => {
  assert.equal(agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } }, 'on', ON), null);
  assert.equal(agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', prompt: 'exo-kind: build\nx' } }, 'on', ON).systemMessage, undefined);
});

test('a refusal gives one line with its reason from the Bash, Edit and Agent hooks', async () => {
  const bash = await dispatchBash(refused('Bash', { command: 'ls' }), undefined, ON);
  const edit = dispatchEdit(refused('Edit', { file_path: '/x' }), ON);
  const agent = agentHook(refused('Agent', { subagent_type: 'Explore' }), 'on', ON);
  const read = contextHook(refused('Read', { file_path: '/x' }), ON);
  for (const output of [bash, edit, agent, read]) {
    assert.equal(output.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(output.systemMessage, /^exo blocked: Context use is \d+k tokens\./);
    assert.ok(output.systemMessage.length <= 'exo blocked: '.length + 140);
  }
});

test('a refusal line is one line even when the reason spans several', async () => {
  const steps = [{ name: 'x', run: () => ({ hookSpecificOutput: { permissionDecision: 'deny', permissionDecisionReason: `first\n\nsecond ${'y'.repeat(300)}` } }) }];
  const output = await dispatchBash({ tool_name: 'Bash' }, steps, ON);
  assert.ok(!output.systemMessage.includes('\n'));
  assert.ok(output.systemMessage.startsWith('exo blocked: first second y'));
  assert.ok(output.systemMessage.endsWith('…'));
});

test('the receipt leaves the model context byte for byte as it was', async () => {
  const cases = [
    [() => contextHook(refused('Read', { file_path: '/x' }), ON), () => contextHook(refused('Read', { file_path: '/x' }), OFF)],
    [() => agentHook(refused('Agent', { subagent_type: 'exo:fork' }), 'on', ON), () => agentHook(refused('Agent', { subagent_type: 'exo:fork' }), 'on', OFF)],
    [() => dispatchEdit(refused('Edit', { file_path: '/x' }), ON), () => dispatchEdit(refused('Edit', { file_path: '/x' }), OFF)],
    [() => agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code' } }, 'on', ON), () => agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code' } }, 'on', OFF)]
  ];
  for (const [on, off] of cases) {
    const shown = on();
    const { systemMessage, ...rest } = shown;
    assert.ok(systemMessage);
    assert.equal(JSON.stringify(rest), JSON.stringify(off()));
  }
  const bash = await dispatchBash(refused('Bash'), undefined, ON);
  const { systemMessage, ...rest } = bash;
  assert.ok(systemMessage);
  assert.equal(JSON.stringify(rest), JSON.stringify(await dispatchBash(refused('Bash'), undefined, OFF)));
});

test('receipts off gives no systemMessage anywhere', async () => {
  assert.equal(contextHook(skill('exo:spec'), OFF), null);
  assert.equal(agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code' } }, 'on', OFF).systemMessage, undefined);
  assert.equal((await dispatchBash(refused('Bash'), undefined, OFF)).systemMessage, undefined);
  assert.equal(dispatchEdit(refused('Edit'), OFF).systemMessage, undefined);
});

test('a call with nothing to show gives no output', async () => {
  assert.equal(await dispatchBash({ tool_name: 'Bash', tool_input: { command: 'ls' } }, undefined, ON), null);
  assert.equal(dispatchEdit({ tool_name: 'Edit', tool_input: { file_path: '/x' } }, ON), null);
});

test('receiptsOn is on by default and off only for off', () => {
  assert.equal(receiptsOn(() => { throw new Error('unknown setting receipts'); }), true);
  for (const value of ['on', true, undefined]) assert.equal(receiptsOn(() => value), true);
  for (const value of ['off', false]) assert.equal(receiptsOn(() => value), false);
});

test('the hook script prints the line on stdout with receipts at their default', () => {
  const config = fs.mkdtempSync(path.join(WORK, 'config-'));
  const project = fs.mkdtempSync(path.join(WORK, 'project-'));
  const env = { ...process.env, CLAUDE_CONFIG_DIR: config, CLAUDE_PROJECT_DIR: project, CLAUDE_PLUGIN_ROOT: REPOSITORY };
  const run = (script, input) => execFileSync(process.execPath, [path.join(REPOSITORY, 'hooks', script)], { env, input: JSON.stringify(input), timeout: 20_000 }).toString();
  assert.deepEqual(JSON.parse(run('context-limit.mjs', skill('exo:build'))), { systemMessage: 'exo › build' });
  assert.match(JSON.parse(run('agent-effort.mjs', { tool_name: 'Agent', tool_input: { subagent_type: 'exo:review-branch' } })).systemMessage, /^exo › review-branch/);
  assert.match(JSON.parse(run('dispatch-bash.mjs', refused('Bash'))).systemMessage, /^exo blocked: /);
  assert.match(JSON.parse(run('dispatch-edit.mjs', refused('Edit'))).systemMessage, /^exo blocked: /);
  fs.mkdirSync(path.join(project, '.claude'));
  fs.writeFileSync(path.join(project, '.claude', 'exo.local.json'), '{"receipts":"off"}');
  assert.equal(run('context-limit.mjs', skill('exo:build')), '');
});
