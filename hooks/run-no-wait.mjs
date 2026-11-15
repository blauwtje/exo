#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readJsonOrNull } from '#basics';
import { inSidecall } from '#hook-input';
import { denyReasonLines } from '../lib/guard-rules.mjs';
import { inRun } from '../lib/run-decision.mjs';
import { roundCap } from '../lib/loop-budget.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, runHook } from '../lib/hook-refusal.mjs';

const RECORD = fileURLToPath(new URL('../lib/run-decision.mjs', import.meta.url));
const blockLimit = () => roundCap('wait') - 1;

const lines = (text) => String(text ?? '').split('\n').map((line) => line.trim()).filter(Boolean);

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
  if (input.tool_name !== 'AskUserQuestion') return null;
  const text = input.tool_input?.questions?.[0]?.question ?? input.tool_input?.question;
  const line = lines(text).pop() ?? '';
  const count = noteBlock(dir, String(input.session_id ?? ''), `Task ${task ?? ''}: BLOCKED ${line}\n`);
  const record = `record the choice with \`node "${RECORD}" <source> <choice> <reason>\`, which appends to ${path.join(dir, 'decisions.md')}`;
  const why = denyReasonLines(count + 1 >= blockLimit() ? 'run-no-wait-final' : 'run-no-wait', record);
  return rememberRefusal(input, { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: why } }, { guard: 'run-no-wait' });
}

if (isMain(import.meta.url) && !inSidecall()) await runHook('run-no-wait', runNoWait);
