#!/usr/bin/env node
// Holds a delegate to a context budget, because a model cannot see its own
// context size. Before each tool call inside a delegate it reads the input,
// cache read and cache creation tokens of the last assistant turn in that
// delegate's own transcript, the sum context-watch takes, and counts the call.
// Past the soft limit it adds one line before each call saying to read nothing
// new and commit what is green; past the hard limit, in tokens or tool calls, it
// denies every tool but the ones that finish a half-made edit and write the
// report, plus a Bash call of `git add`, `git commit`, `git status` or
// `git diff --stat`, optionally after `-C <path>`, so green work still lands.
// That command may hold no chaining, substitution, redirection or second line,
// so nothing rides along. The denial tells the delegate to end its reply with
// the BUDGET line, because a delegate told only that a tool is denied keeps
// retrying it instead of returning, and its caller needs the open part to hand
// it to a fresh agent.
// The main session carries no `agent_id` and is never measured here: its call
// goes to the context watch in context-watch.mjs instead, imported only then, so
// a delegate's call never loads the watch's session store or settings code.
//
//   node delegate-budget.mjs   PreToolUse hook on every tool: stdin is the hook JSON
//
// Limits, in thousands of tokens and in calls: a `Budget: <soft>k/<hard>k` line
// in the dispatch, optionally ending `/<calls> calls`, outranks the entry for the
// hook's `agent_type` in ../assets/delegate-budgets.json, which outranks its
// `default`. The limit it accepts: the usage figure covers the prompt before
// the latest tool result, so a large result shows one call late.
//
// A fault never blocks a tool call: a missing or unreadable transcript prints
// nothing, and any error exits 0 with nothing on stdout.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { contextTokens, parsedEntry, readText } from './transcript-tail.mjs';

const BUDGETS = JSON.parse(fs.readFileSync(new URL('../assets/delegate-budgets.json', import.meta.url), 'utf8'));
const PLAIN_ID = /^[\w-]+$/;
const DISPATCH_BYTES = 64 * 1024;
const BUDGET_LINE = /^Budget: (\d+)k\/(\d+)k(?:\/(\d+) calls)?\s*$/m;
const REPORT_TOOLS = new Set(['Edit', 'Write', 'TaskUpdate', 'TodoWrite']);
const COMMIT_COMMAND = /^git (?:-C \S+ )?(?:add|commit|status|diff --stat)(?:\s.*)?$/s;
// Chaining, a pipe, substitution, redirection or a second line could run anything.
const SHELL_METACHARACTERS = /[;&|`<>\n]|\$\(/;

function delegateTranscript(hookInput) {
  const transcriptPath = hookInput.transcript_path;
  const agentId = hookInput.agent_id;
  if (typeof transcriptPath !== 'string' || typeof agentId !== 'string') return null;
  if (!PLAIN_ID.test(agentId)) return null;
  return path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents', `agent-${agentId}.jsonl`);
}

function promptText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((block) => block?.text ?? '').join('\n');
}

// The dispatch is the transcript's first line; a dispatch longer than
// DISPATCH_BYTES is read as carrying no Budget line.
function dispatchBudget(descriptor, size) {
  const head = readText(descriptor, 0, Math.min(size, DISPATCH_BYTES));
  const firstLineEnd = head.indexOf('\n');
  if (firstLineEnd < 0) return {};
  const dispatch = parsedEntry(head.slice(0, firstLineEnd));
  const match = promptText(dispatch?.message?.content).match(BUDGET_LINE);
  if (!match) return {};
  const budget = { soft: Number(match[1]), hard: Number(match[2]) };
  if (match[3]) budget.calls = Number(match[3]);
  return budget;
}

// One byte appended per call: an append is atomic, so parallel calls lose no count.
function countCall(agentId) {
  const folder = path.join(os.tmpdir(), 'exo-delegate-budget');
  fs.mkdirSync(folder, { recursive: true });
  const counter = path.join(folder, agentId);
  fs.appendFileSync(counter, '.');
  return fs.statSync(counter).size;
}

function isCommitCommand(toolName, toolInput) {
  if (toolName !== 'Bash' || typeof toolInput?.command !== 'string') return false;
  const command = toolInput.command.trim();
  return COMMIT_COMMAND.test(command) && !SHELL_METACHARACTERS.test(command);
}

function decision(toolName, toolInput, tokens, calls, limits, agentType) {
  const used = `${Math.round(tokens / 1000)}k`;
  const pastHard = tokens > limits.hard * 1000 || calls > limits.calls;
  if (pastHard && !REPORT_TOOLS.has(toolName) && !isCommitCommand(toolName, toolInput)) {
    const permissionDecisionReason = `exo budget: ${used} tokens after ${calls} tool calls, past the limit of ${limits.hard}k tokens or ${limits.calls} tool calls. Write your report now and list what is still open under Unresolved. Then stop and end your reply with the one line \`BUDGET: done <finished items or none>; open <items left>; next <one sentence>\`, so the caller hands the open part to a fresh agent. Only Edit to finish a half-made edit, Write, task updates and a lone git add, git commit, git status or git diff --stat, optionally after -C <path>, still run: commit only work that is consistent, and give a commit message as -m "..." holding no ; & | \` $( < > or newline.`;
    return { permissionDecision: 'deny', permissionDecisionReason };
  }
  if (tokens <= limits.soft * 1000) return null;
  const softAdvice = agentType === 'exo:run-unit'
    ? 'finish and land the task in flight, then continue with the next task.'
    : 'commit what is green now, finish the current step and write your report.';
  return { additionalContext: `exo budget: ${used} of ${limits.hard}k tokens used. Read nothing new; ${softAdvice}` };
}

function guard(hookInput) {
  const transcript = delegateTranscript(hookInput);
  if (transcript === null || !fs.existsSync(transcript)) return;
  const descriptor = fs.openSync(transcript, 'r');
  try {
    const size = fs.fstatSync(descriptor).size;
    const tokens = contextTokens(descriptor, size);
    if (tokens === null) return;
    const calls = countCall(hookInput.agent_id);
    const agentBudget = BUDGETS.agents[hookInput.agent_type] ?? {};
    const limits = { ...BUDGETS.default, ...agentBudget, ...dispatchBudget(descriptor, size) };
    const verdict = decision(hookInput.tool_name, hookInput.tool_input, tokens, calls, limits, hookInput.agent_type);
    if (verdict === null) return;
    const hookSpecificOutput = { hookEventName: 'PreToolUse', ...verdict };
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
}

try {
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (typeof hookInput.agent_id === 'string') {
    guard(hookInput);
  } else {
    const { watch } = await import('./context-watch.mjs');
    watch(hookInput);
  }
} catch (error) {
  console.error(`delegate-budget: ${error.message}`);
}
