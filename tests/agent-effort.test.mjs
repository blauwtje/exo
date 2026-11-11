
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { isDeepStrictEqual } from 'node:util';
import { agentEffort, agentHook } from '../hooks/agent-effort.mjs';
import { dispatchMarker, readDispatchRules } from '../hooks/dispatch-rules.mjs';
import { agentTools } from '../lib/agent-tools.mjs';
import { briefLines } from '../lib/guard-rules.mjs';
import { orchestratorWorkers } from '../lib/context-limits.mjs';
import { readKindTable } from '../lib/model-kinds.mjs';
import { SCHEMA } from '../lib/settings-store.mjs';
import { tempDir } from './harness.mjs';

const briefBlock = (type) => `${briefLines(agentTools(type)).join('\n')}\n\n`;

function unbriefed(updated, input) {
  if (!updated) return updated;
  const prompt = updated.prompt.replace(briefBlock(input.subagent_type), '');
  const rest = { ...updated };
  delete rest.prompt;
  const restored = prompt === '' && input.prompt === undefined ? rest : { ...rest, prompt };
  return isDeepStrictEqual(restored, input) ? undefined : restored;
}

const call = (input, budget = 'on') => unbriefed(agentEffort({ tool_name: 'Agent', tool_input: input }, budget)?.hookSpecificOutput.updatedInput, input);

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

test('an unnamed call with no exo-kind line runs as build with the line prepended, an unknown label becomes build', () => {
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
  const unknown = call({ description: 'Edit-evidence false block', prompt: 'exo-kind: Hardest\nx' });
  assert.match(unknown.prompt, /^exo-kind: build\nx/);
  assert.notEqual(decision({ description: 'review the branch', prompt: 'Reads: none' }), 'deny');
  for (const word of ['Investigate', 'Research', 'Summarise', 'Summarize', 'Explore']) assert.notEqual(decision({ description: `${word} the stall`, prompt: 'Reads: none' }), 'deny');
  assert.equal(call({ description: 'Investigate the cause', prompt: 'x' }).model, kinds.hardest.model);
  assert.equal(call({ description: 'Fix the typo', prompt: 'exo-kind: hard\nx' }).model, kinds.build.model);
  for (const description of ['Pickup log lines', 'Picker colours', 'Designated owner', 'Collect findings', 'Add test fixtures']) assert.equal(call({ description, prompt: 'x' }).prompt, 'exo-kind: build\nx', description);
  assert.equal(call({ subagent_type: 'general-purpose', description: 'Edit-evidence false block', prompt: 'Reads: none' }, 'off'), undefined);
  assert.notEqual(decision({ subagent_type: 'exo:research-worker', description: 'Edit-evidence false block', prompt: 'x' }), 'deny');
});

test('the first lead Agent call of a session gets the dispatch rules once, a subagent call none, and session start re-arms them', () => {
  delete process.env.EXO_RUN_DIR;
  const sessionId = `dispatch-test-${process.pid}-${Date.now()}`;
  const lead = { session_id: sessionId, tool_name: 'Agent', tool_input: { subagent_type: 'Explore', prompt: 'x' } };
  const off = () => false;
  try {
    assert.equal(agentHook({ ...lead, agent_id: 'a1' }, 'on', off).hookSpecificOutput.additionalContext, undefined);
    assert.equal(agentHook(lead, 'on', off).hookSpecificOutput.additionalContext, readDispatchRules());
    assert.equal(agentHook(lead, 'on', off).hookSpecificOutput.additionalContext, undefined);
    execFileSync(process.execPath, [path.join(import.meta.dirname, '..', 'hooks', 'session-start.mjs')], { input: JSON.stringify({ session_id: sessionId, source: 'compact' }) });
    assert.equal(agentHook(lead, 'on', off).hookSpecificOutput.additionalContext, readDispatchRules());
  } finally {
    fs.rmSync(dispatchMarker(sessionId), { force: true });
  }
});

test('a task-runner Agent call gets no dispatch rules and leaves them for the next Agent call', () => {
  delete process.env.EXO_RUN_DIR;
  const sessionId = `dispatch-runner-${process.pid}-${Date.now()}`;
  const call = (type) => ({ session_id: sessionId, tool_name: 'Agent', tool_input: { subagent_type: type, prompt: 'x' } });
  const off = () => false;
  try {
    assert.equal(agentHook(call('exo:task-runner'), 'on', off).hookSpecificOutput.additionalContext, undefined);
    assert.equal(agentHook(call('Explore'), 'on', off).hookSpecificOutput.additionalContext, readDispatchRules());
  } finally {
    fs.rmSync(dispatchMarker(sessionId), { force: true });
  }
});

test('the session text leaves the dispatch-only rules out', () => {
  const sessionText = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  for (const line of readDispatchRules().split('\n')) assert.ok(!sessionText.includes(line.slice(2)), line);
});

test('the session text has one wait bullet for the agent notice and one TaskStop bullet for the final report', () => {
  const lines = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8').split('\n');
  assert.ok(lines.includes('- Before saying an agent or task still runs, check it this turn (`tasks/<id>.output` mtime or tail, its log, or `ps`), and if its work ended with no notice, SendMessage it to resume, never claim it runs from a notice alone.'));
  for (const file of ['session-rules.md', 'dispatch-rules.md']) assert.ok(!fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', file), 'utf8').includes('resumes when'));
  assert.ok(readDispatchRules().split('\n').includes('- Wait, return cap and depth per role are in `harnesses/coordination-contract.json`; after a dispatch, end the turn and wait for the notification, and never write the final result while your own background shell runs.'));
  assert.ok(!lines.some((line) => line.includes('holds the session open')));
  assert.ok(lines.includes('- Before the final report, stop every background shell and agent this session started with TaskStop, so nothing runs on after it.'));
});

test('the blanket delegation lines are gone from the session text and the context reference', () => {
  const root = path.join(import.meta.dirname, '..');
  for (const file of [['hooks', 'session-rules.md']]) {
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

test('the session text has no Decided for you list or number-reply rule and still asks the hard cases', () => {
  const text = fs.readFileSync(path.join(import.meta.dirname, '..', 'hooks', 'session-rules.md'), 'utf8');
  assert.doesNotMatch(text, /\*\*Decided for you\*\*/);
  assert.doesNotMatch(text, /reply of only a number/);
  assert.match(text, /^- Ask instead when the step is irreversible, has no safe default, or only/m);
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

function hookOutput(input, budget = 'on') {
  const output = agentHook({ tool_name: 'Agent', tool_input: input }, budget, () => false)?.hookSpecificOutput;
  if (!output?.updatedInput) return output;
  const updatedInput = unbriefed(output.updatedInput, input);
  return updatedInput && { ...output, updatedInput };
}

test('an exo call whose passed model or effort differs from the table is denied with the table pair, the passed pair and the matching labels', () => {
  const { model, effort } = readKindTable(undefined, { budget: 'on' }).kinds.orchestrator;
  const output = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'xhigh' });
  assert.equal(output.permissionDecision, 'deny');
  assert.equal(output.updatedInput, undefined);
  const reason = output.permissionDecisionReason;
  assert.match(reason, new RegExp(`runs on ${model}, ${effort} by the kind table`));
  assert.match(reason, /passed opus, xhigh/);
  assert.match(reason, /No kind runs opus, xhigh; closest on opus: hardest, build-repair, review-deep\./);
  assert.match(reason, /Do instead: drop `model` and `effort`\.$/);
  assert.doesNotMatch(reason, /No user request/);
  const buildTask = readKindTable(undefined, { budget: 'on' }).kinds['build-task'];
  const runnable = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: buildTask.model, effort: buildTask.effort });
  assert.match(runnable.permissionDecisionReason, new RegExp(`labels for ${buildTask.model}, ${buildTask.effort}: .*build-task`));
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', effort: 'xhigh' }).permissionDecision, 'deny');
  assert.equal(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'haiku' }).permissionDecision, 'deny');
});

test('a denied pair that no kind runs names the closest kinds on that model, or none', () => {
  assert.match(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'max' }).permissionDecisionReason, /No kind runs opus, max; closest on opus: hardest, build-repair, review-deep\./);
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
      { subagent_type: 'general-purpose', description: 'Fix the typo', prompt: 'x', effort: 'low' }
    ]);
    assert.deepEqual(call({ subagent_type: 'exo:research-worker', prompt: 'x' }), { subagent_type: 'exo:research-worker', prompt: 'x', effort: 'high' });
  } finally {
    if (before === undefined) delete process.env.EXO_PROVIDER;
    else process.env.EXO_PROVIDER = before;
  }
});

test('an inherit kind sets no model on an exo call, and a passed model is denied', () => {
  assert.equal(call({ subagent_type: 'exo:research-worker', prompt: 'exo-kind: peer-review', effort: 'medium' }), undefined);
  const output = hookOutput({ subagent_type: 'exo:research-worker', prompt: 'exo-kind: peer-review', model: 'opus' });
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /runs on the session model/);
});

test('a label on an exo call with no model or effort moves it only to a label its table entry lists', () => {
  const { kinds } = readKindTable(undefined, { budget: 'on' });
  const pair = (input) => {
    const { model, effort } = call(input);
    return { model, effort };
  };
  assert.deepEqual(pair({ subagent_type: 'exo:research-worker', prompt: 'exo-kind: review\nx' }), { model: kinds.research.model, effort: kinds.research.effort });
  assert.deepEqual(pair({ subagent_type: 'exo:review-branch', prompt: 'exo-kind: review-deep\nx' }), kinds['review-deep']);
  assert.deepEqual(pair({ subagent_type: 'exo:review-branch', prompt: 'exo-kind: hardest\nx' }), kinds['review-branch']);
  assert.equal(hookOutput({ subagent_type: 'exo:research-worker', prompt: 'exo-kind: review\nx' }).permissionDecision, 'allow');
  assert.equal(hookOutput({ subagent_type: 'exo:research-worker', prompt: 'exo-kind: hardest\nx', model: 'opus', effort: 'high' }), undefined);
});

test('a kind ceiling lifts its effort to the session effort up to the ceiling, and names no agent in the hook', () => {
  const { kinds, agents } = readKindTable(undefined, { budget: 'on' });
  const kind = kinds[agents['agents/research-worker.md'].kind];
  assert.equal(kind.ceiling, 'high');
  const run = (input, level) => agentEffort({ tool_name: 'Agent', tool_input: input, effort: { level } }, 'on')?.hookSpecificOutput.updatedInput.effort;
  const openPoints = { subagent_type: 'exo:research-worker', prompt: 'x' };
  for (const level of ['max', 'xhigh', 'high']) assert.equal(run(openPoints, level), 'high');
  for (const level of ['low', 'medium', undefined]) assert.equal(run(openPoints, level), kind.effort);
  assert.equal(run({ ...openPoints, effort: 'max' }, 'xhigh'), 'max');
  assert.equal(run({ subagent_type: 'exo:build-task', prompt: 'x' }, 'max'), kinds['build-task'].effort);
  const hook = fs.readFileSync(new URL('../hooks/agent-effort.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(hook, /exo:research-worker/);
});

test('the denied call shows its reason in the hook line', () => {
  const hook = agentHook({ tool_name: 'Agent', tool_input: { subagent_type: 'exo:research-worker', prompt: 'x', model: 'opus', effort: 'max' } }, 'on', () => true);
  assert.match(hook.systemMessage, /^exo blocked: This delegate runs on the model and effort of its kind: exo:research-worker runs on /);
});

test('worker size: an orchestrator dispatch needs Reads and Result and stays in budget', () => {
  const dir = tempDir('worker-hook-');
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

test('worker size: a refusal names unresolved paths, the largest reads and a missing Result', () => {
  const dir = tempDir('worker-hook-');
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(70000));
  const reason = (subagent_type, prompt) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd: dir, tool_input: { subagent_type, description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecisionReason;
  assert.match(reason('general-purpose', 'Reads: nope.txt\nResult: .exo/r.md'), /nope\.txt/);
  assert.match(reason('general-purpose', 'Reads: big.txt\nResult: .exo/r.md'), /largest reads big\.txt \(\d+\).*cut at least \d+ tokens.*`lines N-M` or `by grep`.*by path/);
  assert.match(reason('general-purpose', 'Reads: none'), /lacks Result\b.*`Result:` line naming one `\.exo\/<\.\.\.>\.md` file/);
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
  const dir = tempDir('worker-hook-');
  fs.writeFileSync(path.join(dir, 'a.md'), 'x');
  const run = (prompt) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd: dir, tool_input: { subagent_type: 'general-purpose', description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput;
  for (const reads of ['none.', 'None', '`a.md`.']) {
    const output = run(`Reads: ${reads}\nResult: .exo/r.md`);
    assert.notEqual(output?.permissionDecision, 'deny', reads);
    assert.match(output.updatedInput.prompt, /^Reads: (none|a\.md)$/m, reads);
  }
  const reason = run('Reads: gone.md.\nResult: .exo/r.md').permissionDecisionReason;
  assert.match(reason, /do not exist: gone\.md \(searched [^)]*\)\. Do instead: write `Reads:` as items split by `,` or `;`, each a path, optionally followed by `lines N-M`, `by grep` or a trailing \(note\) or \[note\], or `Reads: none`; name only files that exist now and no glob, and an item that does not start with a path is prose and is not read\.$/);
  assert.doesNotMatch(reason, /\.\./);
});

const workerReason = (prompt, cwd) => agentHook({ tool_name: 'Agent', agent_type: 'exo:orchestrator', cwd, tool_input: { subagent_type: 'general-purpose', description: 'work', prompt } }, 'on', () => false)?.hookSpecificOutput.permissionDecisionReason;

test('a missing path that exists under an absolute directory in the prompt asks for a Worktree line', () => {
  const tree = tempDir('worker-tree-');
  fs.writeFileSync(path.join(tree, 'notes.md'), 'x');
  const elsewhere = tempDir('worker-cwd-');
  assert.match(workerReason(`Work in ${tree}.\nReads: notes.md\nResult: .exo/r.md`, elsewhere), new RegExp(`add a \`Worktree: ${tree}\` line`));
  assert.doesNotMatch(workerReason('Reads: notes.md\nResult: .exo/r.md', elsewhere), /Worktree/);
});

test('a brief with another label for its reads is told to rename it and keep one field per line', () => {
  const reason = workerReason('Read first: a.md\nResult: .exo/r.md', os.tmpdir());
  assert.match(reason, /has `Read first: a\.md`; rename it to `Reads:`/);
  assert.match(reason, /one field per line, each label at the start of its line/);
  assert.match(workerReason('Result: .exo/r.md', os.tmpdir()), /one field per line, each label at the start of its line/);
});

test('the lacks-Reads denial quotes a read label with a parenthetical, and a label whose value starts with read', () => {
  const forms = [
    ['- Inputs (each a candidate folder; read every file):\n  - /tmp/x/', '- Inputs (each a candidate folder; read every file):'],
    ['Files (checkout /tmp/repo):\n- web/src/a.jsx (the page)', 'Files (checkout /tmp/repo):'],
    ['- Before editing: read `skills/a/references/b.md`, `c.md`', '- Before editing: read `skills/a/references/b.md`, `c.md`'],
  ];
  for (const [lines, quoted] of forms) {
    const reason = workerReason(`${lines}\nResult: .exo/r.md`, os.tmpdir());
    assert.ok(reason.includes(`it has \`${quoted}\`; rename it to \`Reads:\`.`), reason);
  }
});

test('an over-budget refusal says a qualifier is only lines N-M or by grep after the path', () => {
  const dir = tempDir('worker-hook-');
  fs.writeFileSync(path.join(dir, 'big.txt'), 'x'.repeat(70000));
  assert.match(workerReason('Reads: big.txt\nResult: .exo/r.md', dir), /a qualifier is only `lines N-M` or `by grep` right after the path/);
});

test('a mismatch caused by an exo-kind label names the label as the source and never a model to switch to', () => {
  const reason = hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'exo-kind: build\nWorkers: 1', model: 'opus', effort: 'xhigh' }).permissionDecisionReason;
  assert.match(reason, /runs on [^;]+ because `exo-kind: build` in the brief moved it; the call passed opus, xhigh\./);
  assert.match(reason, /Do instead: drop `model` and `effort`\.$/);
  assert.doesNotMatch(hookOutput({ subagent_type: 'exo:orchestrator', prompt: 'Workers: 1', model: 'opus', effort: 'xhigh' }).permissionDecisionReason, /because/);
});

test('the orchestrator description states the Reads line shape', () => {
  const agent = fs.readFileSync(new URL('../agents/orchestrator.md', import.meta.url), 'utf8');
  assert.match(/^description: (.+)$/m.exec(agent)[1], /`Reads: a\.md, lib\/b\.mjs` or `none`/);
});

test('an Agent call with worktree isolation is denied and the deny names the Worktree line route', () => {
  const output = hookOutput({ subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply', isolation: 'worktree' });
  assert.equal(output.permissionDecision, 'deny');
  assert.match(output.permissionDecisionReason, /`Worktree: <abs path>`/);
  assert.match(output.permissionDecisionReason, /no `isolation`/);
});

test('an Agent call without isolation, or with a Worktree line, is not denied for isolation', () => {
  const plain = hookOutput({ subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply' });
  assert.notEqual(plain?.permissionDecision, 'deny');
  const routed = hookOutput({ subagent_type: 'general-purpose', prompt: `Worktree: ${process.cwd()}\nReads: none\nResult: reply` });
  assert.notEqual(routed?.permissionDecision, 'deny');
});

test('on deepseek an orchestrator part with one worker is told to run its unit itself', () => {
  const input = { subagent_type: 'exo:orchestrator', prompt: 'exo-kind: orchestrator\nWorkers: 1\nReads: none\ndo it' };
  const hook = { tool_name: 'Agent', tool_input: input };
  const run = (provider, tool) => {
    if (provider) process.env.EXO_PROVIDER = provider;
    else delete process.env.EXO_PROVIDER;
    try {
      return agentEffort(tool, 'on')?.hookSpecificOutput.updatedInput.prompt ?? tool.tool_input.prompt;
    } finally {
      delete process.env.EXO_PROVIDER;
    }
  };
  assert.match(run('deepseek', hook), /run your single unit yourself and spawn no worker/i);
  assert.doesNotMatch(run(undefined, hook), /spawn no worker/i);
  const three = { ...hook, tool_input: { ...input, prompt: input.prompt.replace('Workers: 1', 'Workers: 3') } };
  assert.doesNotMatch(run('deepseek', three), /spawn no worker/i);
  const twice = { ...hook, tool_input: { ...input, prompt: run('deepseek', hook) } };
  assert.equal(run('deepseek', twice).match(/spawn no worker/gi).length, 1);
});

test('a main-session web research brief to an unnamed agent is denied toward the research route', () => {
  const unnamed = (type, agentId) => agentHook({ tool_name: 'Agent', session_id: `route-unnamed-${process.pid}-${agentId ?? type}`, ...(agentId && { agent_id: agentId, agent_type: 'orchestrator' }), tool_input: { subagent_type: type, prompt: `Sources: web\nFetches: 1\nResult: .exo/r.md\n${type}` } }, 'on', () => false)?.hookSpecificOutput;
  for (const type of ['general-purpose', 'claude']) {
    const denied = unnamed(type);
    assert.equal(denied.permissionDecision, 'deny');
    assert.match(denied.permissionDecisionReason, /Do instead: use `exo:research-worker` for one part, or one `exo:orchestrator` with `Workers: <n>`/);
  }
  assert.doesNotMatch(unnamed('general-purpose', 'sub1')?.permissionDecisionReason ?? '', /research route|exo:research-worker/);
});

test('a second main-session web research dispatch inside the window is sent to one orchestrator', () => {
  const session = `route-fanout-${process.pid}`;
  const research = (id, agentId) => agentHook({ tool_name: 'Agent', session_id: id, ...(agentId && { agent_id: agentId }), tool_input: { subagent_type: 'exo:research-worker', prompt: 'Sources: web\nFetches: 1\nResult: .exo/r.md\nx' } }, 'on', () => false)?.hookSpecificOutput;
  fs.rmSync(path.join(os.tmpdir(), `exo-research-${session}`), { force: true });
  assert.notEqual(research(session)?.permissionDecision, 'deny');
  const second = research(session);
  assert.equal(second.permissionDecision, 'deny');
  assert.match(second.permissionDecisionReason, /Do instead: send the remaining research parts to one `exo:orchestrator`/);
  assert.notEqual(research(session, 'sub1')?.permissionDecision, 'deny');
  assert.notEqual(research(`${session}-other`)?.permissionDecision, 'deny');
  fs.rmSync(path.join(os.tmpdir(), `exo-research-${session}`), { force: true });
  fs.rmSync(path.join(os.tmpdir(), `exo-research-${session}-other`), { force: true });
});

test('an Agent dispatch from a worker role is denied and one from a coordinator is not', () => {
  const dispatch = (agentType) => agentHook({ tool_name: 'Agent', session_id: `role-${process.pid}-${agentType}`, agent_id: 'sub1', agent_type: agentType, tool_input: { subagent_type: 'general-purpose', prompt: 'Reads: none\nResult: reply\nx' } }, 'on', () => false)?.hookSpecificOutput;
  const worker = dispatch('exo:research-worker');
  assert.equal(worker.permissionDecision, 'deny');
  assert.match(worker.permissionDecisionReason, /worker row has mayDispatch false/);
  assert.doesNotMatch(dispatch('exo:orchestrator')?.permissionDecisionReason ?? '', /mayDispatch false/);
});

function refusals(tag, input) {
  const session = `${tag}-${process.pid}-${Date.now()}`;
  const hook = { session_id: session, tool_name: 'Agent', tool_input: input };
  const ledger = path.join(os.tmpdir(), `exo-refusal-${session}`);
  try {
    return [1, 2, 3].map(() => agentHook(hook, 'on').hookSpecificOutput.permissionDecisionReason);
  } finally {
    fs.rmSync(ledger, { recursive: true, force: true });
  }
}

test('one dispatch breaking three rules is refused once naming all three and the third stops naming them still', () => {
  const input = { subagent_type: 'exo:orchestrator', isolation: 'worktree', model: 'haiku', prompt: 'do it' };
  const reasons = refusals('loop', input);
  for (const reason of [reasons[0], reasons[2]]) {
    assert.match(reason, /isolation/i);
    assert.match(reason, /Workers/);
    assert.match(reason, /passed haiku/);
  }
  assert.doesNotMatch(reasons[0], /LOOP refusal STOP/);
  assert.doesNotMatch(reasons[1], /LOOP refusal STOP/);
  assert.match(reasons[2], /LOOP refusal STOP .*cap/);
});

test('out-of-scope: an edited brief of the same dispatch identity keeps counting toward the cap', () => {
  const session = `edit-${process.pid}-${Date.now()}`;
  const ledger = path.join(os.tmpdir(), `exo-refusal-${session}`);
  try {
    const reasons = ['a', 'b', 'c'].map((tail) => agentHook({ session_id: session, tool_name: 'Agent', tool_input: { subagent_type: 'exo:orchestrator', description: 'same task', isolation: 'worktree', prompt: `do it ${tail}` } }, 'on').hookSpecificOutput.permissionDecisionReason);
    assert.match(reasons[2], /LOOP refusal STOP/);
  } finally {
    fs.rmSync(ledger, { recursive: true, force: true });
  }
});
