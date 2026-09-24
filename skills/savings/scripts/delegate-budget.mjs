#!/usr/bin/env node
// Holds a delegate to a context budget, because a model cannot see its own
// context size. Before each tool call inside a delegate it reads the input,
// cache read and cache creation tokens of the last assistant turn in that
// delegate's own transcript, the sum context-watch takes, and counts the call.
// Past the soft limit it adds one line before each call saying to read nothing
// new and commit what is green; past the hard limit, in tokens or tool calls, it
// denies every tool but the ones that finish a half-made edit and write the
// report, plus a Bash call of `git add`, `git commit`, `git status` or
// `git diff --stat`, so green work still lands. That command may hold no
// chaining, substitution, redirection or second line, so nothing rides along.
// The main session carries no `agent_id` and is never measured.
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
import { usageCounts } from './token-weights.mjs';

const BUDGETS = JSON.parse(fs.readFileSync(new URL('../assets/delegate-budgets.json', import.meta.url), 'utf8'));
const PLAIN_ID = /^[\w-]+$/;
// One assistant line is small unless it carries a large tool input, so the tail
// read widens only when it holds no complete usage line.
const TAIL_BYTES = 256 * 1024;
const DISPATCH_BYTES = 64 * 1024;
const BUDGET_LINE = /^Budget: (\d+)k\/(\d+)k(?:\/(\d+) calls)?\s*$/m;
const REPORT_TOOLS = new Set(['Edit', 'Write', 'TaskUpdate', 'TodoWrite']);
const COMMIT_COMMAND = /^git (?:add|commit|status|diff --stat)(?:\s.*)?$/s;
// Chaining, a pipe, substitution, redirection or a second line could run anything.
const SHELL_METACHARACTERS = /[;&|`<>\n]|\$\(/;

function delegateTranscript(hookInput) {
  const transcriptPath = hookInput.transcript_path;
  const agentId = hookInput.agent_id;
  if (typeof transcriptPath !== 'string' || typeof agentId !== 'string') return null;
  if (!PLAIN_ID.test(agentId)) return null;
  return path.join(transcriptPath.replace(/\.jsonl$/, ''), 'subagents', `agent-${agentId}.jsonl`);
}

function readText(descriptor, start, length) {
  const buffer = Buffer.alloc(length);
  const bytesRead = fs.readSync(descriptor, buffer, 0, length, start);
  return buffer.toString('utf8', 0, bytesRead);
}

// The line being written when the hook runs may be cut off mid-JSON.
function parsedEntry(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

// Null when no complete assistant usage line exists, such as before the first turn.
function contextTokens(descriptor, size) {
  for (let want = TAIL_BYTES; ; want *= 4) {
    const start = Math.max(size - want, 0);
    const lines = readText(descriptor, start, size - start).split('\n');
    // A tail that starts inside the file opens on a partial line.
    const firstWhole = start === 0 ? 0 : 1;
    for (let index = lines.length - 1; index >= firstWhole; index -= 1) {
      if (!lines[index].includes('"usage"')) continue;
      const entry = parsedEntry(lines[index]);
      const usage = entry?.type === 'assistant' ? entry.message?.usage : null;
      if (!usage) continue;
      const counts = usageCounts(usage);
      return counts.input + counts.cacheRead + counts.cache5m + counts.cache1h;
    }
    if (start === 0) return null;
  }
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

function decision(toolName, toolInput, tokens, calls, limits) {
  const used = `${Math.round(tokens / 1000)}k`;
  const pastHard = tokens > limits.hard * 1000 || calls > limits.calls;
  if (pastHard && !REPORT_TOOLS.has(toolName) && !isCommitCommand(toolName, toolInput)) {
    const permissionDecisionReason = `exo budget: ${used} tokens after ${calls} tool calls, past the limit of ${limits.hard}k tokens or ${limits.calls} tool calls. Write your report now and list what is still open under Unresolved. Only Edit to finish a half-made edit, Write, task updates and a lone git add, git commit, git status or git diff --stat still run; give a commit message as -m "..." holding no ; & | \` $( < > or newline.`;
    return { permissionDecision: 'deny', permissionDecisionReason };
  }
  if (tokens <= limits.soft * 1000) return null;
  return { additionalContext: `exo budget: ${used} of ${limits.hard}k tokens used. Read nothing new; commit what is green now, finish the current step and write your report.` };
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
    const verdict = decision(hookInput.tool_name, hookInput.tool_input, tokens, calls, limits);
    if (verdict === null) return;
    const hookSpecificOutput = { hookEventName: 'PreToolUse', ...verdict };
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
  } finally {
    fs.closeSync(descriptor);
  }
}

try {
  guard(JSON.parse(fs.readFileSync(0, 'utf8')));
} catch (error) {
  console.error(`delegate-budget: ${error.message}`);
}
