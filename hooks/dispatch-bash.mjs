#!/usr/bin/env node

import process from 'node:process';
import { inSidecall } from '#hook-input';
import { denyReason } from '../lib/guard-rules.mjs';
import { stripDataHeredocs, tokenize } from '../lib/git-deny.mjs';
import { pollsUnbounded } from '../lib/shell-fixes.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { rememberRefusal, runHook } from '../lib/hook-refusal.mjs';
import { withReceipt } from './context-limit.mjs';
import { COMMIT_ATTRIBUTION_STEP, SHARED_STATE_STEP, refuse } from '../lib/lazy-steps.mjs';

const COMMAND_KEYWORDS = new Set(['do', 'then', 'else']);
const runsSleep = (command) => tokenize(command).some((tokens) => tokens.find((token) => !COMMAND_KEYWORDS.has(token)) === 'sleep');

export const SLEEP_STEP = {
  name: 'sleep',
  run(hookInput) {
    const command = hookInput.tool_input?.command;
    if (typeof command !== 'string') return null;
    const scanned = stripDataHeredocs(command);
    const waitsInForeground = hookInput.tool_name !== 'Monitor' && !hookInput.tool_input.run_in_background;
    if (!waitsInForeground) return null;
    return pollsUnbounded(scanned) || runsSleep(scanned) ? refuse('sleep', denyReason('sleep'), hookInput) : null;
  }
};

async function stepOutput(step, hookInput) {
  try {
    const output = await step.run(hookInput);
    return output ? output.hookSpecificOutput ?? {} : undefined;
  } catch (error) {
    console.error(`${step.name}: ${error.message}`);
    return undefined;
  }
}

export async function dispatchBash(hookInput, steps = [SHARED_STATE_STEP, COMMIT_ATTRIBUTION_STEP, SLEEP_STEP], enabled) {
  const outputs = [];
  for (const step of steps) {
    const output = await stepOutput(step, hookInput);
    if (output) outputs.push(output);
  }
  const { verdict, output } = mergeOutputs(outputs);
  return rememberRefusal(hookInput, withReceipt(output, { hookInput, fields: verdict, enabled }), { guard: 'dispatch-bash' });
}

function mergeOutputs(outputs) {
  const verdict = outputs.find((output) => output.permissionDecision === 'deny')
    ?? outputs.find((output) => output.permissionDecision !== undefined);
  const merged = { hookEventName: 'PreToolUse' };
  if (verdict) Object.assign(merged, { permissionDecision: verdict.permissionDecision, permissionDecisionReason: verdict.permissionDecisionReason });
  const contexts = outputs.map((output) => output.additionalContext).filter(Boolean);
  if (contexts.length > 0) merged.additionalContext = contexts.join('\n');
  return { verdict, output: Object.keys(merged).length === 1 ? null : { hookSpecificOutput: merged } };
}

if (isMain(import.meta.url) && !inSidecall()) await runHook('dispatch-bash', dispatchBash);
