#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { escapeRegExp, readJsonOrNull } from '#basics';
import { inSidecall } from '#hook-input';
import { denyReasonLines } from '../lib/guard-rules.mjs';
import { inRun } from '../lib/run-decision.mjs';
import { roundCap } from '../lib/loop-budget.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, runHook } from '../lib/hook-refusal.mjs';

const RECORD = fileURLToPath(new URL('../lib/run-decision.mjs', import.meta.url));
const OPTION = /^(?:[-*+]\s+)?[*_`]*(?:Option\s+(?:[A-Za-z]|\d{1,2})\b|(?:[A-Za-z]|\d{1,2})(?:\s*\([^)]*\))?[*_`]*\s*[):.])/;

const blockLimit = () => roundCap('wait') - 1;

const lines = (text) => String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

function entryText(line) {
  const entry = JSON.parse(line);
  const content = entry.message?.role === 'assistant' || entry.type === 'assistant' ? entry.message?.content : null;
  const text = Array.isArray(content) ? content.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : content;
  return typeof text === 'string' && text.trim() ? text : undefined;
}

function lastEntryText(entries) {
  for (const line of entries.toReversed()) {
    const text = entryText(line);
    if (text) return text;
  }
  return '';
}

function transcriptEnd(file) {
  try {
    return lastEntryText(fs.readFileSync(file, 'utf8').split('\n').filter(Boolean));
  } catch {
    return '';
  }
}

function endText(input) {
  return typeof input.last_assistant_message === 'string' && input.last_assistant_message.trim()
    ? input.last_assistant_message : transcriptEnd(input.transcript_path);
}

function openQuestion(text) {
  const rest = lines(text);
  while (rest.length > 1 && OPTION.test(rest.at(-1))) rest.pop();
  return (rest.at(-1) ?? '').replace(/[*_`\s]+$/, '').endsWith('?');
}

function missingStatus(line, task, text) {
  return task ? !new RegExp(`^Task ${escapeRegExp(task)}: (GREEN|LANDED|BLOCKED|PLAN DRIFT|FAIL)\\b`).test(line) : openQuestion(text);
}

function noteBlock(dir, session, blockedNote) {
  const file = path.join(dir, 'blocks.json');
  const counts = readJsonOrNull(file) ?? {};
  const count = Number.isInteger(counts[session]) ? counts[session] : 0;
  if (count >= blockLimit()) {
    fs.writeFileSync(path.join(dir, 'blocked'), blockedNote);
    return count;
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ ...counts, [session]: count + 1 }));
  return count;
}

export function runNoWait(input, { env = process.env } = {}) {
  const dir = env.EXO_RUN_DIR;
  const task = env.EXO_RUN_REPAIR ? null : env.EXO_RUN_TASK?.split('/').pop();
  if (!inRun(env) || !dir || !input) return null;
  const asking = input.tool_name === 'AskUserQuestion' && input.hook_event_name !== 'Stop';
  const text = asking ? input.tool_input?.questions?.[0]?.question ?? input.tool_input?.question : endText(input);
  const line = lines(text).pop() ?? '';
  if (!asking && !missingStatus(line, task, text)) return null;
  const count = noteBlock(dir, String(input.session_id ?? ''), `Task ${task ?? ''}: BLOCKED ${line}\n`);
  const atLimit = count >= blockLimit();
  const record = `record the choice with \`node "${RECORD}" <source> <choice> <reason>\`, which appends to ${path.join(dir, 'decisions.md')}`;
  const why = denyReasonLines(count + 1 >= blockLimit() ? 'run-no-wait-final' : 'run-no-wait', record);
  if (asking) return rememberRefusal(input, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }, { guard: 'run-no-wait' });
  return atLimit ? null : rememberRefusal(input, { decision: 'block', reason: why }, { guard: 'run-no-wait' });
}

if (isMain(import.meta.url) && !inSidecall()) await runHook('run-no-wait', runNoWait);
