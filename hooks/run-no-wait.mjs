#!/usr/bin/env node
// PreToolUse AskUserQuestion and Stop hook of an exo run (EXO_RUN_DIR set): the
// session never waits on the human. A question is denied and a session end
// without a status line is blocked (a session with no task: an end on a question,
// also one followed by answer options), both telling the session to decide from the
// spec and settings. Blocks are counted per session in <EXO_RUN_DIR>/blocks.json;
// at the limit the end passes and <EXO_RUN_DIR>/blocked holds `Task <n>: BLOCKED <line>`.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { readHookText } from '#hook-input';
import { inRun } from '../lib/run-decision.mjs';
import { isMain } from '../lib/script-flags.mjs';

export const BLOCK_LIMIT = 2;

const DECIDE = 'Do not wait for the user: decide from the spec and the exo settings, append `- <source>: <choice> (<reason>)` to';
const FINAL = 'If no decision is possible, end with `Task <n>: BLOCKED <question>`.';

function reason(dir, count) {
  const first = `${DECIDE} ${path.join(dir, 'decisions.md')}, and continue.`;
  return count >= BLOCK_LIMIT ? `${first} ${FINAL}` : first;
}

function lastLine(text) {
  return String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean).pop() ?? '';
}

// The last assistant text of the transcript, '' when unreadable.
function transcriptEnd(file) {
  try {
    const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse();
    for (const line of lines) {
      const entry = JSON.parse(line);
      const content = entry.message?.role === 'assistant' || entry.type === 'assistant' ? entry.message?.content : null;
      const text = Array.isArray(content) ? content.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : content;
      if (typeof text === 'string' && text.trim()) return text;
    }
  } catch {
    // An unreadable transcript counts as no end text.
  }
  return '';
}

function endText(input) {
  return typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()
    ? input.last_assistant_message : transcriptEnd(input.transcript_path);
}

// An answer-option line: `- **A (best):** ...`, `A)`, `B.`, `Option B`, `1)`.
const OPTION = /^(?:[-*+]\s+)?[*_`]*(?:Option\s+(?:[A-Za-z]|\d{1,2})\b|(?:[A-Za-z]|\d{1,2})(?:\s*\([^)]*\))?[*_`]*\s*[):.])/;
const asks = (line) => line.replace(/[*_`\s]+$/, '').endsWith('?');

// Whether the end leaves the human a question: its last line, or the line above its trailing option lines, ends on `?`.
function openQuestion(text) {
  const lines = String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  while (lines.length > 1 && OPTION.test(lines.at(-1))) lines.pop();
  return asks(lines.at(-1) ?? '');
}

function missingStatus(line, task, text) {
  return task ? !new RegExp(`^Task ${task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (GREEN|LANDED|BLOCKED|PLAN DRIFT|FAIL)\\b`).test(line) : openQuestion(text);
}

// The hook output, or null to let the call or the end go.
export function runNoWait(input, { env = process.env, dir = env.EXO_RUN_DIR, task = env.EXO_RUN_TASK?.split('/').pop() } = {}) {
  if (!inRun(env) || !dir || !input) return null;
  const asking = input.tool_name === 'AskUserQuestion' && input.hook_event_name !== 'Stop';
  let line = '';
  if (asking) {
    const question = input.tool_input?.questions?.[0]?.question ?? input.tool_input?.question;
    line = lastLine(question);
  } else {
    const text = endText(input);
    line = lastLine(text);
    if (!missingStatus(line, task, text)) return null;
  }
  const file = path.join(dir, 'blocks.json');
  let counts = {};
  try { counts = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first block */ }
  const session = String(input.session_id ?? '');
  const count = Number.isInteger(counts[session]) ? counts[session] : 0;
  const atLimit = count >= BLOCK_LIMIT;
  if (atLimit) {
    fs.writeFileSync(path.join(dir, 'blocked'), `Task ${task ?? ''}: BLOCKED ${line}\n`);
  } else {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...counts, [session]: count + 1 }));
  }
  const why = reason(dir, count + 1);
  if (asking) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } };
  return atLimit ? null : { decision: 'block', reason: why };
}

if (isMain(import.meta.url)) {
  try {
    const output = runNoWait(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // Unreadable input leaves the call or the end as it is.
  }
}
