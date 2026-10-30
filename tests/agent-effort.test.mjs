
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

delete process.env.EXO_PROVIDER;

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

test('the session text leaves the dispatch-only rules out', () => {
  const sessionText = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  for (const line of readDispatchRules().split('\n')) assert.ok(!sessionText.includes(line.slice(2)), line);
});

test('the session text has one TaskStop bullet for the agent notice and one for the final report', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n');
  assert.ok(lines.includes('- Agent notice says it still waits on background work → stop it with TaskStop.'));
  assert.ok(lines.includes('- Before final report → stop every background shell and agent this session started with TaskStop.'));
});

const TRIGGER_LINES = [
  [/^- Default inline →/, /only when one of T1 to T6/],
  [/^- T1 /, /at most 5 tool turns.*one file to edit with at most 2 to read\) → inline\.$/],
  [/^- T2 /, /6\+ tool turns.*→ `fetch-docs` or `locate-code`/],
  [/^- T3 /, /2\+ independent parts, each 6\+ tool turns → one subagent per part, Agent calls in one message; shared-file parts → one agent\.$/],
  [/^- T4 /, /each need the previous result → one worker.*never split\.$/],
  [/^- T5 /, /soft limit, remaining work of 2\+ tool turns → subagents\.$/],
  [/^- T6 /, /over 5 minutes → `run_in_background`/],
];

test('the session text and the context reference carry the same trigger lines T1 to T6', () => {
  const root = path.join(import.meta.dirname, '..');
  const session = fs.readFileSync(path.join(root, 'hooks', 'session-rules.md'), 'utf8').split('\n');
  const context = fs.readFileSync(path.join(root, 'skills', 'route-skills', 'references', 'context.md'), 'utf8').split('\n');
  for (const [start, shape] of TRIGGER_LINES) {
    const lines = session.filter((l) => start.test(l));
    assert.equal(lines.length, 1, String(start));
    assert.match(lines[0], shape);
    assert.ok(context.includes(lines[0]), lines[0]);
  }
});

test('the blanket delegation lines are gone from the session text and the context reference', () => {
  const root = path.join(import.meta.dirname, '..');
  for (const file of [['hooks', 'session-rules.md'], ['skills', 'route-skills', 'references', 'context.md']]) {
    const text = fs.readFileSync(path.join(root, ...file), 'utf8');
    assert.doesNotMatch(text, /^- Request with 2\+ parts/m);
    assert.doesNotMatch(text, /^- Main-session work/m);
  }
});

test('the session text has one off-brief return line: a SendMessage correction before any redispatch, fix rounds kept for review findings', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n').filter((l) => l.startsWith('- Off-brief return →'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /one SendMessage naming the drift .*and the rule it broke; stop or redispatch only when the next return still drifts or the agent is past its hard context limit; a new review finding follows `\*\*Fix rounds\.\*\*`\.$/);
  assert.doesNotMatch(lines[0], /fresh session/);
});

test('the session text has one Decided for you line within 380 bytes: list shape, 5-item cap, still-asked cases, number reply', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n').filter((l) => l.includes('**Decided for you**'));
  assert.equal(lines.length, 1);
  assert.ok(Buffer.byteLength(lines[0] + '\n') <= 380);
  assert.match(lines[0], /up to 5 lines/);
  assert.match(lines[0], /hardest to undo first/);
  assert.match(lines[0], /irreversible, no safe default/);
  assert.match(lines[0], /only a number → apply that alternative, no question; unknown number → repeat list/);
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

const hookOutput = (input, budget = 'on') => agentHook({ tool_name: 'Agent', tool_input: input }, budget, () => false)?.hookSpecificOutput;

test('an exo call whose passed model or effort differs from the table is denied with the table pair, the passed pair and the matching labels', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.orchestrator;
  const output = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model: 'opus', effort: 'high' });
  assert.equal(output.permissionDecision, 'deny');
  assert.equal(output.updatedInput, undefined);
  const reason = output.permissionDecisionReason;
  assert.match(reason, new RegExp(`runs on ${model}, ${effort} by the kind table`));
  assert.match(reason, /passed opus, high/);
  assert.match(reason, /labels for opus, high: hardest, review, review-deep\./);
  assert.match(reason, /No user request for that model → drop `model` and `effort`\./);
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', effort: 'high' }).permissionDecision, 'deny');
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model: 'haiku' }).permissionDecision, 'deny');
});

test('a denied pair that no kind runs names the closest kinds on that model, or none', () => {
  assert.match(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model: 'opus', effort: 'max' }).permissionDecisionReason, /No kind runs opus, max; closest on opus: orchestrator\./);
  assert.match(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model: 'fable', effort: 'high' }).permissionDecisionReason, /No kind runs fable, high, and none runs fable\./);
});

test('an exo call passing the table model and effort, a label that makes the pair the table pair, off, and a general-purpose call pass through', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.orchestrator;
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model, effort }), undefined);
  assert.notEqual(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model })?.permissionDecision, 'deny');
  assert.notEqual(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'exo-kind: hardest\nx', model: 'opus', effort: 'high' })?.permissionDecision, 'deny');
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'x', model: 'opus', effort: 'high' }, 'off'), undefined);
  assert.equal(hookOutput({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup', model: 'opus', effort: 'max' }), undefined);
});

test('the session provider picks its kind column, an unlisted or unset one keeps the claude column', () => {
  const before = process.env.EXO_PROVIDER;
  const outputs = () => [call({ subagent_type: 'exo:build-task', prompt: 'x' }), call({ subagent_type: 'general-purpose', description: 'Fix the typo', prompt: 'x' })];
  try {
    delete process.env.EXO_PROVIDER;
    const claude = outputs();
    assert.deepEqual(claude[0], { subagent_type: 'exo:build-task', prompt: 'x', model: 'sonnet', effort: 'low' });
    process.env.EXO_PROVIDER = 'zai';
    assert.deepEqual(outputs(), claude);
    process.env.EXO_PROVIDER = 'deepseek';
    assert.deepEqual(outputs(), [
      { subagent_type: 'exo:build-task', prompt: 'x', effort: 'low' },
      { subagent_type: 'general-purpose', description: 'Fix the typo', prompt: 'x', effort: 'high' }
    ]);
    assert.deepEqual(call({ subagent_type: 'exo:locate-code', prompt: 'x' }), { subagent_type: 'exo:locate-code', prompt: 'x', effort: 'high' });
  } finally {
    if (before === undefined) delete process.env.EXO_PROVIDER;
    else process.env.EXO_PROVIDER = before;
  }
});

test('an inherit kind sets no model on an exo call, and a passed model is denied', () => {
  assert.equal(call({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: handover' }), undefined);
  const output = hookOutput({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: handover', model: 'opus' });
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /runs on the session model/);
});

test('the raised find-open-points effort still wins over the table', () => {
  const run = (level) => agentEffort({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:find-open-points', prompt: 'x' }, effort: { level } }, 'on').hookSpecificOutput.updatedInput;
  assert.equal(run('max').effort, 'max');
  assert.equal(run('xhigh').effort, 'xhigh');
});

test('the denied call shows its reason in the hook line', () => {
  const hook = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:locate-code', prompt: 'x', model: 'opus', effort: 'max' } }, 'on', () => true);
  assert.match(hook.systemMessage, /^exo blocked: exo:locate-code runs on /);
});
