
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { agentEffort, agentHook } from '../hooks/agent-effort.mjs';
import { dispatchMarker, readDispatchRules } from '../hooks/dispatch-rules.mjs';
import { orchestratorWorkers } from '../lib/context-limits.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';
import { SCHEMA } from '../lib/settings-store.mjs';

const call = (input, budget = 'on') => agentEffort({ tool_name: 'Agent', tool_input: input }, budget)?.hookSpecificOutput.updatedInput;

delete process.env.EXO_PROVIDER;

test('the budget setting defaults to on', () => {
  assert.equal(SCHEMA.budget.default, 'on');
});

test('a general-purpose, claude or untyped call with no model or effort gets the unnamed kind', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.build;
  for (const type of ['general-purpose', 'claude', undefined]) {
    assert.deepEqual(call({ subagent_type: type, prompt: 'x' }), { subagent_type: type, prompt: 'exo-kind: build\nx', model, effort });
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

test('an unnamed call with no exo-kind line runs as build with the line prepended, an unknown label is denied', () => {
  const decision = (input, budget = 'on') => agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', ...input } }, budget, () => false)?.hookSpecificOutput.permissionDecision;
  const { kinds } = readKindTable(undefined, { budget: 'on' });
  const unlabelled = call({ description: 'Edit-evidence false block', prompt: 'x' });
  assert.equal(decision({ description: 'Edit-evidence false block', prompt: 'Reads: none\nx' }), 'allow');
  assert.equal(unlabelled.prompt, 'exo-kind: build\nx');
  assert.equal(unlabelled.model, kinds.build.model);
  assert.equal(unlabelled.effort, kinds.build.effort);
  assert.equal(call({ description: 'Edit-evidence false block' }).prompt, 'exo-kind: build\n');
  assert.equal(call({ description: 'Review the branch', prompt: 'x' }).prompt, 'x');
  assert.equal(call({ description: 'Edit-evidence false block', prompt: 'exo-kind: hardest\nx' }).prompt, 'exo-kind: hardest\nx');
  const unknown = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'Edit-evidence false block', prompt: 'exo-kind: Hardest\nx' } }, 'on', () => false).hookSpecificOutput;
  assert.equal(unknown.permissionDecision, 'deny');
  assert.match(unknown.permissionDecisionReason, /exo-kind:/);
  assert.match(unknown.permissionDecisionReason, /hardest/);
  assert.notEqual(decision({ description: 'review the branch', prompt: 'Reads: none' }), 'deny');
  for (const word of ['Investigate', 'Research', 'Summarise', 'Summarize', 'Explore']) assert.notEqual(decision({ description: `${word} the stall`, prompt: 'Reads: none' }), 'deny');
  assert.equal(call({ description: 'Investigate the cause', prompt: 'x' }).model, kinds.hardest.model);
  assert.equal(call({ description: 'Fix the typo', prompt: 'exo-kind: hard\nx' }).model, kinds.build.model);
  for (const description of ['Pickup log lines', 'Picker colours', 'Designated owner', 'Collect findings', 'Add test fixtures']) assert.equal(call({ description, prompt: 'x' }).prompt, 'exo-kind: build\nx', description);
  assert.equal(decision({ description: 'Edit-evidence false block', prompt: 'Reads: none' }, 'off'), undefined);
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
  assert.ok(lines.includes('- Stop an agent whose notice says it still waits on background work with TaskStop, since it holds the session open.'));
  assert.ok(lines.includes('- Before the final report, stop every background shell and agent this session started with TaskStop, so nothing runs on after it.'));
});

const TRIGGER_LINES = [
  [/^- Default inline →/, /only when one of T1 to T5/],
  [/^- T1 /, /at most 5 tool turns.*one file to edit with at most 2 to read\) → inline\.$/],
  [/^- T2 /, /6\+ tool turns.*→ `fetch-docs` or `locate-code`/],
  [/^- T3 /, /2\+ independent parts, each 6\+ tool turns → one subagent per part, Agent calls in one message; shared-file parts → one agent\.$/],
  [/^- T4 /, /each need the previous result → one worker.*never split\.$/],
  [/^- T5 /, /over 5 minutes → `run_in_background`/],
];

test('the session text and the context reference carry the same trigger lines T1 to T5', () => {
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
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n').filter((l) => l.startsWith('- When an agent returns off-brief'));
  assert.equal(lines.length, 1);
  assert.match(lines[0], /one SendMessage naming the drift .*and the rule it broke, and stop or redispatch only when the next return still drifts or the agent is past its hard context limit; a new review finding follows `\*\*Fix rounds\.\*\*`\.$/);
  assert.doesNotMatch(lines[0], /fresh session/);
});

test('the session text has one Decided for you line within 380 bytes: list shape, 5-item cap, still-asked cases, number reply', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n').filter((l) => l.includes('**Decided for you**'));
  assert.equal(lines.length, 1);
  assert.ok(Buffer.byteLength(lines[0] + '\n') <= 380);
  assert.match(lines[0], /up to 5 lines/);
  assert.match(lines[0], /hardest to undo first/);
  const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  assert.match(text, /^- Ask instead when the step is irreversible, has no safe default, or only/m);
  assert.match(text, /^- Treat a reply of only a number as that alternative without a question, and repeat the list for an unknown number/m);
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
  const output = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'xhigh' });
  assert.equal(output.permissionDecision, 'deny');
  assert.equal(output.updatedInput, undefined);
  const reason = output.permissionDecisionReason;
  assert.match(reason, new RegExp(`runs on ${model}, ${effort} by the kind table`));
  assert.match(reason, /passed opus, xhigh/);
  assert.match(reason, /No kind runs opus, xhigh; closest on opus: hardest, review, review-deep, orchestrator\./);
  assert.match(reason, /No user request for that model → drop `model` and `effort`\./);
  const buildTask = readKindTable(undefined, { budget: 'on' }).kinds['build-task'];
  const runnable = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: buildTask.model, effort: buildTask.effort });
  assert.match(runnable.permissionDecisionReason, new RegExp(`labels for ${buildTask.model}, ${buildTask.effort}: .*build-task`));
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', effort: 'xhigh' }).permissionDecision, 'deny');
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'haiku' }).permissionDecision, 'deny');
});

test('a denied pair that no kind runs names the closest kinds on that model, or none', () => {
  assert.match(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'max' }).permissionDecisionReason, /No kind runs opus, max; closest on opus: hardest, review, review-deep, orchestrator\./);
  assert.match(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'fable', effort: 'high' }).permissionDecisionReason, /No kind runs fable, high, and none runs fable\./);
});

test('an exo call passing the table model and effort, a label that makes the pair the table pair, off, and a general-purpose call pass through', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.orchestrator;
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model, effort }), undefined);
  assert.notEqual(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model })?.permissionDecision, 'deny');
  assert.notEqual(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'exo-kind: hardest\nWorkers: 1', model: 'opus', effort: 'high' })?.permissionDecision, 'deny');
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'high' }, 'off'), undefined);
  assert.equal(hookOutput({ subagent_type: 'general-purpose', prompt: 'exo-kind: lookup\nReads: none', model: 'opus', effort: 'max' }), undefined);
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
  assert.equal(call({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: handover', effort: 'medium' }), undefined);
  const output = hookOutput({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: handover', model: 'opus' });
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /runs on the session model/);
});

test('a label on an exo call with no model or effort moves it only to a label its table entry lists', () => {
  const { kinds } = readKindTable(undefined, { budget: 'on' });
  const pair = (input) => {
    const { model, effort } = call(input);
    return { model, effort };
  };
  assert.deepEqual(pair({ subagent_type: 'exo:fetch-docs', prompt: 'exo-kind: review\nx' }), kinds.research);
  assert.deepEqual(pair({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: review\nx' }), kinds.lookup);
  assert.deepEqual(pair({ subagent_type: 'exo:review-branch', prompt: 'exo-kind: review-deep\nx' }), kinds['review-deep']);
  assert.deepEqual(pair({ subagent_type: 'exo:review-branch', prompt: 'exo-kind: hardest\nx' }), kinds['review-branch']);
  assert.equal(hookOutput({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: review\nx' }).permissionDecision, 'allow');
  assert.equal(hookOutput({ subagent_type: 'exo:locate-code', prompt: 'exo-kind: hardest\nx', model: 'opus', effort: 'high' }), undefined);
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

test('worker size: an orchestrator dispatch needs Reads and Result and stays in budget', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-hook-'));
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(70000));
  const run = (agent_type, prompt) => agentHook({ tool_name: 'Agent', agent_type, cwd: dir, tool_input: { subagent_type: 'general-purpose', description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecision;
  assert.equal(run('exo:orchestrator', 'do it'), 'deny');
  assert.equal(run('exo:orchestrator', 'Reads: big.txt\nResult: .exo/r.md'), 'deny');
  assert.equal(run('exo:orchestrator', 'Reads: none\nResult: .exo/r.md'), 'allow');
  assert.equal(run('exo:orchestrator', 'Reads: none'), 'deny');
  assert.equal(run('exo:orchestrator', 'Reads: none\nResult: out.txt'), 'deny');
  assert.equal(run(undefined, 'do it'), 'deny');
  assert.equal(run(undefined, 'Reads: none'), 'allow');
  assert.equal(run(undefined, 'Reads: big.txt'), 'deny');
});

test('worker size: an orchestrator exo:fetch-docs dispatch is sized by Fetches and needs no Result; other callers stay unsized', () => {
  const run = (agent_type, prompt) => agentHook({ tool_name: 'Agent', agent_type, tool_input: { subagent_type: 'exo:fetch-docs', description: 'docs', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecision;
  assert.equal(run('exo:orchestrator', 'Reads: none\nFetches: 19'), 'deny');
  assert.equal(run('exo:orchestrator', 'Reads: none\nFetches: 1'), 'allow');
  assert.equal(run(undefined, 'Reads: none\nFetches: 19'), 'allow');
});

test('worker size: a refusal names unresolved paths, invalid Fetches, the largest reads and no Result for fetch-docs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-hook-'));
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(70000));
  const reason = (subagent_type, prompt) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd: dir, tool_input: { subagent_type, description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason('general-purpose', 'Reads: nope.txt\nResult: .exo/r.md'), /nope\.txt/);
  assert.match(reason('exo:fetch-docs', 'Reads: none\nFetches: many'), /Fetches/);
  assert.match(reason('general-purpose', 'Reads: big.txt\nResult: .exo/r.md'), /Largest reads: big\.txt \(\d+\).*Cut at least \d+ tokens.*`lines N-M` or `by grep`.*by path/);
  assert.match(reason('general-purpose', 'Reads: none'), /lacks Result\b.*`Result:` line naming one `\.exo\/<\.\.\.>\.md` file/);
  const fetchReason = reason('exo:fetch-docs', 'Reads: none\nFetches: 19');
  assert.match(fetchReason, /Fetches/);
  assert.doesNotMatch(fetchReason, /Result/);
});

test('worker size: an exo:orchestrator dispatch from a non-orchestrator needs Workers within the limit', () => {
  const run = (agent_type, prompt) => agentHook({ tool_name: 'Agent', agent_type, tool_input: { subagent_type: 'exo:orchestrator', description: 'slice', prompt } }, 'on', () => false)?.hookSpecificOutput;
  assert.notEqual(run(undefined, 'Workers: 4')?.permissionDecision, 'deny');
  assert.equal(run(undefined, 'Workers: 5').permissionDecision, 'deny');
  assert.match(run(undefined, 'Workers: 5').permissionDecisionReason, /1 to 4.*slices/);
  assert.equal(run(undefined, 'do it').permissionDecision, 'deny');
  assert.equal(run(undefined, 'Workers: 0').permissionDecision, 'deny');
  assert.notEqual(run('exo:orchestrator', 'do it')?.permissionDecision, 'deny');
});

test('the orchestrator description tells the lead the Workers line and its limit before the first dispatch', () => {
  const agent = fs.readFileSync(new URL('../agents/orchestrator.md', import.meta.url), 'utf8');
  const description = /^description: (.+)$/m.exec(agent)[1];
  assert.match(description, /`Workers: <n>`/);
  assert.match(description, new RegExp(`n from 1 to ${orchestratorWorkers()}\\b`));
});

test('worker size: a none. or punctuated Reads line runs normalized and a missing path names the expected shape', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-hook-'));
  fs.writeFileSync(path.join(dir, 'a.md'), 'x');
  const run = (prompt) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd: dir, tool_input: { subagent_type: 'general-purpose', description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput;
  for (const reads of ['none.', 'None', '`a.md`.']) {
    const output = run(`Reads: ${reads}\nResult: .exo/r.md`);
    assert.notEqual(output?.permissionDecision, 'deny', reads);
    assert.match(output.updatedInput.prompt, /^Reads: (none|a\.md)$/m, reads);
  }
  const reason = run('Reads: gone.md.\nResult: .exo/r.md').permissionDecisionReason;
  assert.match(reason, /do not exist: gone\.md \(searched [^)]*\)\. Write `Reads:` as items split by `,` or `;`, each a path, optionally followed by `lines N-M` or `by grep`, or `Reads: none`; an item that does not start with a path is prose and is not read\.$/);
  assert.doesNotMatch(reason, /\.\./);
});

test('the orchestrator description states the Reads line shape', () => {
  const agent = fs.readFileSync(new URL('../agents/orchestrator.md', import.meta.url), 'utf8');
  assert.match(/^description: (.+)$/m.exec(agent)[1], /`Reads: a\.md, lib\/b\.mjs` or `none`/);
});
