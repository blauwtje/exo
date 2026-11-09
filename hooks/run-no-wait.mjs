#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readJsonOrNull } from '#basics';
import { inSidecall, readHookText } from '#hook-input';
import { denyReason } from '../lib/guard-rules.mjs';
import { inRun } from '../lib/run-decision.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, writeHookOutput } from '../lib/hook-refusal.mjs';

export const BLOCK_LIMIT = 2;

const RECORD = fileURLToPath(new URL('../lib/run-decision.mjs', import.meta.url));
const OPTION = /^(?:[-*+]\s+)?[*_`]*(?:Option\s+(?:[A-Za-z]|\d{1,2})\b|(?:[A-Za-z]|\d{1,2})(?:\s*\([^)]*\))?[*_`]*\s*[):.])/;

const lines = (text) => String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

function transcriptEnd(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).reverse()) {
      const entry = JSON.parse(line);
      const content = entry.message?.role === 'assistant' || entry.type === 'assistant' ? entry.message?.content : null;
      const text = Array.isArray(content) ? content.filter((part) => part.type === 'text').map((part) => part.text).join('\n') : content;
      if (typeof text === 'string' && text.trim()) return text;
    }
  } catch { }
  return '';
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
  return task ? !new RegExp(`^Task ${task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: (GREEN|LANDED|BLOCKED|PLAN DRIFT|FAIL)\\b`).test(line) : openQuestion(text);
}

export function runNoWait(input, { env = process.env, dir = env.EXO_RUN_DIR, task = env.EXO_RUN_REPAIR ? null : env.EXO_RUN_TASK?.split('/').pop() } = {}) {
  if (!inRun(env) || !dir || !input) return null;
  const asking = input.tool_name === 'AskUserQuestion' && input.hook_event_name !== 'Stop';
  const text = asking ? input.tool_input?.questions?.[0]?.question ?? input.tool_input?.question : endText(input);
  const line = lines(text).pop() ?? '';
  if (!asking && !missingStatus(line, task, text)) return null;
  const file = path.join(dir, 'blocks.json');
  const counts = readJsonOrNull(file) ?? {};
  const session = String(input.session_id ?? '');
  const count = Number.isInteger(counts[session]) ? counts[session] : 0;
  const atLimit = count >= BLOCK_LIMIT;
  if (atLimit) {
    fs.writeFileSync(path.join(dir, 'blocked'), `Task ${task ?? ''}: BLOCKED ${line}\n`);
  } else {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ ...counts, [session]: count + 1 }));
  }
  const record = `record the choice with \`node "${RECORD}" <source> <choice> <reason>\`, which appends to ${path.join(dir, 'decisions.md')}`;
  const why = denyReason(count + 1 >= BLOCK_LIMIT ? 'run-no-wait-final' : 'run-no-wait', record);
  if (asking) return rememberRefusal(input, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }, { guard: 'run-no-wait' });
  return atLimit ? null : rememberRefusal(input, { decision: 'block', reason: why }, { guard: 'run-no-wait' });
}

if (isMain(import.meta.url) && !inSidecall()) {
  try {
    const input = JSON.parse(await readHookText());
    writeHookOutput(input, runNoWait(input), 'run-no-wait');
  } catch { }
}
