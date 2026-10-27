
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

const call = (input, budget = 'on') => agentEffort({ tool_name: 'Agent', tool_input: input }, budget)?.hookSpecificOutput.updatedInput;

test('the budget setting defaults to on', () => {
  assert.equal(SCHEMA.budget.default, 'on');
});

test('a general-purpose, claude or untyped call with no model or effort gets the unnamed kind', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds[readKindTable().unnamed.kind];
  for (const type of ['general-purpose', 'claude', undefined]) {
    assert.deepEqual(call({ subagent_type: type, prompt: 'x' }), { subagent_type: type, prompt: 'x', model, effort });
  }
});

test('an unnamed call resolves its kind from job words in the description, an exo-kind line first', () => {
  const { kinds } = readKindTable(undefined, { budget: 'on' });
  const kindOf = (input) => call({ subagent_type: 'general-purpose', ...input });
  assert.equal(kindOf({ description: 'Fix edit-evidence false block cause' }).model, kinds.hardest.model);
  assert.equal(kindOf({ description: 'Fix edit-evidence false block cause' }).effort, kinds.hardest.effort);
  assert.equal(kindOf({ description: 'Fix the typo' }).model, kinds.build.model);
  assert.equal(kindOf({ description: 'Fix the typo' }).effort, kinds.build.effort);
  assert.equal(kindOf({ description: 'Reviewing the diff' }).model, kinds.review.model);
  assert.equal(kindOf({ description: 'Fix the typo', prompt: 'exo-kind: lookup' }).model, kinds.lookup.model);
  assert.equal(kindOf({ description: 'Fix the typo', prompt: 'exo-kind: lookup' }).effort, kinds.lookup.effort);
  assert.equal(kindOf({ description: 'Summarise notes' }).effort, kinds.investigate.effort);
  for (const [description, kind] of [['Decides the cause', 'hardest'], ['Designing a table', 'hardest'], ['Diagnosed stall', 'hardest'], ['Summarised notes', 'investigate'], ['Picked a winner', 'hardest']]) {
    assert.equal(kindOf({ description }).model, kinds[kind].model, description);
    assert.equal(kindOf({ description }).effort, kinds[kind].effort, description);
  }
});

test('an explicit model or effort, an exo-kind line, off and other types leave the unnamed fill out', () => {
  assert.equal(call({ subagent_type: 'general-purpose', model: 'opus' }), undefined);
  assert.equal(call({ subagent_type: 'claude', effort: 'high' }), undefined);
  assert.equal(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup' }).model, 'sonnet');
  assert.equal(call({ subagent_type: 'general-purpose' }, 'off'), undefined);
  for (const type of ['fork', 'Explore', 'claude-code-guide', 'statusline-setup']) assert.equal(call({ subagent_type: type }), undefined);
});

test('an unnamed call that names no job is denied with the exo-kind route, a labelled or job-worded one is not', () => {
  const decision = (input, budget = 'on') => agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', ...input } }, budget, () => false)?.hookSpecificOutput.permissionDecision;
  const denied = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'Edit-evidence false block', prompt: 'x' } }, 'on', () => false).hookSpecificOutput;
  assert.equal(denied.permissionDecision, 'deny');
  assert.match(denied.permissionDecisionReason, /exo-kind:/);
  assert.match(denied.permissionDecisionReason, /hardest/);
  assert.notEqual(decision({ description: 'Edit-evidence false block', prompt: 'exo-kind: build\nx' }), 'deny');
  assert.notEqual(decision({ description: 'review the branch', prompt: 'x' }), 'deny');
  assert.equal(decision({ description: 'Edit-evidence false block', prompt: 'exo-kind: Hardest\nx' }), 'deny');
  for (const word of ['Investigate', 'Research', 'Summarise', 'Summarize', 'Explore']) assert.notEqual(decision({ description: `${word} the stall`, prompt: 'x' }), 'deny');
  assert.equal(call({ description: 'Investigate the cause', prompt: 'x' }).model, readKindTable(undefined, { budget: 'on' }).kinds.hardest.model);
  assert.equal(call({ description: 'Fix the typo', prompt: 'exo-kind: hard\nx' }).model, readKindTable(undefined, { budget: 'on' }).kinds.build.model);
  for (const description of ['Pickup log lines', 'Picker colours', 'Designated owner', 'Collect findings', 'Add test fixtures']) assert.equal(decision({ description, prompt: 'x' }), 'deny', description);
  assert.notEqual(decision({ description: 'Edit-evidence false block', prompt: 'x' }, 'off'), 'deny');
  assert.notEqual(decision({ subagent_type: 'exo:locate-code', description: 'Edit-evidence false block', prompt: 'x' }), 'deny');
});

test('the first lead Agent call of a session gets the dispatch rules once, a subagent call none, and session start re-arms them', () => {
  delete process.env.EXO_RUN_DIR;
  const sessionId = `dispatch-test-${process.pid}-${Date.now()}`;
  const lead = { session_id: sessionId, tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } };
  const off = () => false;
  try {
    assert.equal(agentHook({ ...lead, agent_id: 'a1' }, 'on', off), null);
    assert.equal(agentHook(lead, 'on', off).hookSpecificOutput.additionalContext, readDispatchRules());
    assert.equal(agentHook(lead, 'on', off), null);
    execFileSync(process.execPath, [path.join(import.meta.dirname, '..', 'hooks', 'session-start.mjs')], { input: JSON.stringify({ session_id: sessionId, source: 'compact' }) });
    assert.equal(agentHook(lead, 'on', off).hookSpecificOutput.additionalContext, readDispatchRules());
  } finally {
    fs.rmSync(dispatchMarker(sessionId), { force: true });
  }
});

test('the session text keeps the fan-out line and leaves the dispatch-only rules out', () => {
  const sessionText = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  assert.match(sessionText, /one subagent for each part/);
  for (const line of readDispatchRules().split('\n')) assert.ok(!sessionText.includes(line.slice(2)), line);
});

test('the session text has one TaskStop bullet for the agent notice and one for the final report', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n');
  assert.ok(lines.includes('- Agent notice says it still waits on background work → stop it with TaskStop.'));
  assert.ok(lines.includes('- Before final report → stop every background shell and agent this session started with TaskStop.'));
});

test('the session text and the context reference carry the same chunking line', () => {
  const root = path.join(import.meta.dirname, '..');
  const line = fs.readFileSync(path.join(root, 'hooks', 'session-rules.md'), 'utf8').split('\n').find((l) => l.startsWith('- Main-session work'));
  assert.ok(line);
  assert.match(line, /at the 60k warning hand the rest to subagents\.$/);
  assert.doesNotMatch(line, /fresh session/);
  assert.ok(fs.readFileSync(path.join(root, 'skills', 'route-skills', 'references', 'context.md'), 'utf8').split('\n').includes(line));
});

test('the session text has one off-brief return line: a SendMessage correction before any redispatch, fix rounds kept for review findings', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n').filter((l) => l.startsWith('- Off-brief return →'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /one SendMessage naming the drift .*and the rule it broke; stop or redispatch only when the next return still drifts or the agent is past its hard context limit; a new review finding follows `\*\*Fix rounds\.\*\*`\.$/);
  assert.doesNotMatch(lines[0], /fresh session/);
});

test('the Codex host note maps TaskStop to killing the process', () => {
  const note = fs.readFileSync(path.join(import.meta.dirname, '..', 'harnesses', 'codex', 'host-note.md'), 'utf8');
  assert.match(note, /^- Run TaskStop as killing the process\.$/m);
});

test('a prompt with an exo-retry line gets the retry cell of a build-task, other kinds keep the on cell', () => {
  const on = readKindTable(undefined, { budget: 'on' });
  const retry = readKindTable(undefined, { budget: 'on', retry: true });
  assert.notDeepEqual(retry.kinds['build-task'], on.kinds['build-task']);
  const { model, effort } = retry.kinds['build-task'];
  assert.deepEqual(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: build-task\nexo-retry' }, 'on'), { subagent_type: 'general-purpose', prompt: 'exo-kind: build-task\nexo-retry', model, effort });
  assert.equal(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup\nexo-retry' }, 'on').model, on.kinds.lookup.model);
  assert.equal(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: build-task' }, 'on').model, on.kinds['build-task'].model);
});

test('an exo call has its passed model and effort replaced by the table, a general-purpose call keeps them', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.lookup;
  assert.deepEqual(call({ subagent_type: 'exo:locate-code', prompt: 'x', model: 'opus', effort: 'max' }), { subagent_type: 'exo:locate-code', prompt: 'x', model, effort });
  assert.equal(call({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup', model: 'opus', effort: 'max' }), undefined);
});

test('an inherit kind drops a passed model on an exo call so the session model applies', () => {
  const updated = call({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: handover', model: 'opus' });
  assert.equal(Object.hasOwn(updated, 'model'), false);
});

test('the raised find-open-points effort still wins over the table', () => {
  const run = (level) => agentEffort({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:find-open-points', prompt: 'x', model: 'haiku', effort: 'low' }, effort: { level } }, 'on').hookSpecificOutput.updatedInput;
  assert.equal(run('max').effort, 'max');
  assert.equal(run('xhigh').effort, 'xhigh');
});

test('the hook line names the replaced model and effort', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.lookup;
  const hook = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code', prompt: 'x', model: 'opus', effort: 'max' } }, 'on', () => true);
  assert.equal(hook.systemMessage, `exo › locate-code (${model}, ${effort}; replaced opus, max)`);
});
