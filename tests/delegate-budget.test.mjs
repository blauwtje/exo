// The delegate budget measures only a delegate: past the soft limit it adds
// one line before each call, past the hard limit it denies every tool but the
// ones that finish an edit, write the report and commit green work through a
// lone git add, commit, status or diff --stat, and in the main session, on a
// missing transcript or on a fault it prints nothing.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { fixture } from './harness.mjs';

const SCRIPTS = fileURLToPath(new URL('../skills/savings/scripts/', import.meta.url));
const BUDGET = path.join(SCRIPTS, 'delegate-budget.mjs');

function runBudget(script, hookInput, env) {
  return new Promise((resolve) => {
    const child = execFile(
      process.execPath,
      [script],
      { env: { ...process.env, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => resolve({ code: error ? (error.code ?? 1) : 0, stdout: String(stdout), stderr: String(stderr) })
    );
    child.stdin.end(JSON.stringify(hookInput));
  });
}

function dispatchLine(prompt) {
  return JSON.stringify({ type: 'user', isSidechain: true, agentId: 'a1', message: { role: 'user', content: prompt } });
}

// Input 10 plus cache creation 2,000 plus cache read makes the context size.
function assistantLine(contextTokens) {
  const usage = { input_tokens: 10, cache_read_input_tokens: contextTokens - 2010, cache_creation_input_tokens: 2000, output_tokens: 50 };
  return JSON.stringify({ type: 'assistant', isSidechain: true, agentId: 'a1', message: { id: `msg-${contextTokens}`, usage } });
}

// The harness writes a delegate's transcript under the main transcript's name,
// in subagents/agent-<agent_id>.jsonl.
async function budgetFixture(lines) {
  const root = await fixture();
  const mainTranscript = path.join(root, 'session.jsonl');
  await fs.writeFile(mainTranscript, `${assistantLine(150_000)}\n`);
  const subagents = path.join(root, 'session', 'subagents');
  await fs.mkdir(subagents, { recursive: true });
  await fs.writeFile(path.join(subagents, 'agent-a1.jsonl'), lines.join('\n'));
  const hookInput = {
    session_id: 's1',
    transcript_path: mainTranscript,
    agent_id: 'a1',
    agent_type: 'exo:implementer',
    hook_event_name: 'PreToolUse',
    tool_name: 'Read',
    tool_input: { file_path: '/repo/a.mjs' }
  };
  return { root, hookInput, env: { TMPDIR: root } };
}

function decisionOf(result) {
  assert.equal(result.code, 0, result.stderr);
  if (result.stdout === '') return null;
  return JSON.parse(result.stdout).hookSpecificOutput;
}

test('a delegate under the soft limit gets nothing', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(30_000), '']);
  assert.equal(decisionOf(await runBudget(BUDGET, hookInput, env)), null);
});

test('past the soft limit a delegate gets one line with the tokens used', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(45_000), '']);
  const decision = decisionOf(await runBudget(BUDGET, hookInput, env));
  assert.equal(decision.hookEventName, 'PreToolUse');
  assert.equal(decision.permissionDecision, undefined);
  assert.equal(decision.additionalContext, 'exo budget: 45k of 100k tokens used. Read nothing new; commit what is green now, finish the current step and write your report.');
});

test('past the hard limit a delegate is denied a Read and told to write its report', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(102_000), '']);
  const decision = decisionOf(await runBudget(BUDGET, hookInput, env));
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^exo budget: 102k tokens after 1 tool calls, past the limit of 100k tokens or 60 tool calls\./);
  assert.match(decision.permissionDecisionReason, /Write your report now and list what is still open under Unresolved\./);
});

test('past the hard limit an Edit, a Write and a task update still run', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(102_000), '']);
  for (const toolName of ['Edit', 'Write', 'TaskUpdate', 'TodoWrite']) {
    const decision = decisionOf(await runBudget(BUDGET, { ...hookInput, tool_name: toolName }, env));
    assert.equal(decision.permissionDecision, undefined, toolName);
    assert.match(decision.additionalContext, /^exo budget: 102k of 100k tokens used\./, toolName);
  }
  for (const toolName of ['Bash', 'Grep', 'Glob', 'Agent']) {
    const decision = decisionOf(await runBudget(BUDGET, { ...hookInput, tool_name: toolName }, env));
    assert.equal(decision.permissionDecision, 'deny', toolName);
  }
});

test('past the hard limit a lone git add, commit, status or diff --stat still runs', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(102_000), '']);
  const commands = [
    'git add skills/savings/scripts/delegate-budget.mjs tests/delegate-budget.test.mjs',
    'git add -A',
    '  git commit -m "fix(savings): let a delegate commit past the hard limit"  ',
    'git status',
    'git status --short',
    'git diff --stat',
    'git diff --stat HEAD~1\n'
  ];
  for (const command of commands) {
    const decision = decisionOf(await runBudget(BUDGET, { ...hookInput, tool_name: 'Bash', tool_input: { command } }, env));
    assert.equal(decision.permissionDecision, undefined, command);
    assert.match(decision.additionalContext, /^exo budget: 102k of 100k tokens used\./, command);
  }
});

test('past the hard limit any other Bash command, or a git command that chains, is denied', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(102_000), '']);
  const commands = [
    'git push',
    'git push origin HEAD',
    'rm -rf x',
    'git diff',
    'git addx .',
    'git add . && rm x',
    'git add .; rm x',
    'git status | sh',
    'git commit -m "$(rm x)"',
    'git commit -m "`rm x`"',
    'git status > out.txt',
    'git add < list.txt',
    'git add .\nrm x',
    'git add . & rm x'
  ];
  for (const command of commands) {
    const decision = decisionOf(await runBudget(BUDGET, { ...hookInput, tool_name: 'Bash', tool_input: { command } }, env));
    assert.equal(decision.permissionDecision, 'deny', command);
    assert.match(decision.permissionDecisionReason, /git add, git commit, git status or git diff --stat/, command);
    assert.match(decision.permissionDecisionReason, /-m "\.\.\."/, command);
  }
});

test('the call past the tool-call limit is denied under the token limits', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1\nBudget: 40k/70k/3 calls\n'), assistantLine(20_000), '']);
  for (let call = 1; call <= 3; call += 1) {
    assert.equal(decisionOf(await runBudget(BUDGET, hookInput, env)), null, `call ${call}`);
  }
  const decision = decisionOf(await runBudget(BUDGET, hookInput, env));
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^exo budget: 20k tokens after 4 tool calls, past the limit of 70k tokens or 3 tool calls\./);
});

test('the main session is never measured or denied', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(72_000), '']);
  const mainThread = { ...hookInput };
  delete mainThread.agent_id;
  delete mainThread.agent_type;
  assert.equal(decisionOf(await runBudget(BUDGET, mainThread, env)), null);
});

test('a delegate whose transcript is missing gets nothing', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(72_000), '']);
  assert.equal(decisionOf(await runBudget(BUDGET, { ...hookInput, agent_id: 'a2' }, env)), null);
});

test('an agent id that is not a plain name is never joined into a path', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(72_000), '']);
  assert.equal(decisionOf(await runBudget(BUDGET, { ...hookInput, agent_id: '../session/subagents/agent-a1' }, env)), null);
});

test('a torn last line is skipped for the last complete usage line, past a large tool result', async () => {
  const toolResult = JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'y'.repeat(900_000) }] } });
  const torn = '{"type":"assistant","message":{"usage":{"input_tokens":1,"cache_read_input_tokens":99';
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(10_000), toolResult, assistantLine(102_000), toolResult, torn]);
  const decision = decisionOf(await runBudget(BUDGET, hookInput, env));
  assert.equal(decision.permissionDecision, 'deny');
  assert.match(decision.permissionDecisionReason, /^exo budget: 102k tokens/);
});

test('a transcript with no complete usage line gets nothing', async () => {
  const { hookInput, env } = await budgetFixture([dispatchLine('Task 1'), '{"type":"assistant","message":{"usage":{"inp']);
  assert.equal(decisionOf(await runBudget(BUDGET, hookInput, env)), null);
});

// A copy of the scripts beside its own budgets file, so a per-type limit is
// tested without writing one into the shipped file.
async function pluginCopy(root, budgets) {
  const scripts = path.join(root, 'plugin', 'skills', 'savings', 'scripts');
  const assets = path.join(root, 'plugin', 'skills', 'savings', 'assets');
  await fs.mkdir(scripts, { recursive: true });
  await fs.mkdir(assets, { recursive: true });
  for (const name of ['delegate-budget.mjs', 'token-weights.mjs']) {
    await fs.copyFile(path.join(SCRIPTS, name), path.join(scripts, name));
  }
  await fs.writeFile(path.join(assets, 'delegate-budgets.json'), JSON.stringify(budgets));
  return path.join(scripts, 'delegate-budget.mjs');
}

const TYPED_BUDGETS = { default: { soft: 40, hard: 70, calls: 60 }, agents: { 'exo:implementer': { soft: 20, hard: 30 } } };

test('an agent type listed in the budgets file gets its own limits', async () => {
  const { root, hookInput, env } = await budgetFixture([dispatchLine('Task 1'), assistantLine(25_000), '']);
  const script = await pluginCopy(root, TYPED_BUDGETS);
  const decision = decisionOf(await runBudget(script, hookInput, env));
  assert.equal(decision.additionalContext, 'exo budget: 25k of 30k tokens used. Read nothing new; commit what is green now, finish the current step and write your report.');
  assert.equal(decisionOf(await runBudget(script, { ...hookInput, agent_type: 'exo:explorer' }, env)), null);
});

test('a Budget line in the dispatch outranks the agent type limits', async () => {
  const { root, hookInput, env } = await budgetFixture([dispatchLine('Task 1 of plan.md.\nBudget: 50k/90k\nReport to: r.md'), assistantLine(80_000), '']);
  const script = await pluginCopy(root, TYPED_BUDGETS);
  const decision = decisionOf(await runBudget(script, hookInput, env));
  assert.equal(decision.permissionDecision, undefined);
  assert.equal(decision.additionalContext, 'exo budget: 80k of 90k tokens used. Read nothing new; commit what is green now, finish the current step and write your report.');
});
