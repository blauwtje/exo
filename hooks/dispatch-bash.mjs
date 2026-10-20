#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';
import { withReceipt } from './context-limit.mjs';

export const CONTEXT_STEP = {
  name: 'context-limit',
  run(hookInput) {
    const fields = contextFields(contextDecision(hookInput));
    return fields && { hookSpecificOutput: fields };
  }
};

export async function dispatchBash(hookInput, steps = [CONTEXT_STEP], enabled) {
  const outputs = [];
  for (const step of steps) {
    try {
      const output = await step.run(hookInput);
      if (output) outputs.push(output.hookSpecificOutput ?? {});
    } catch (error) {
      console.error(`${step.name}: ${error.message}`);
    }
  }
  const verdict = outputs.find((output) => output.permissionDecision === 'deny')
    ?? outputs.find((output) => output.permissionDecision !== undefined);
  const merged = { hookEventName: 'PreToolUse' };
  if (verdict) Object.assign(merged, { permissionDecision: verdict.permissionDecision, permissionDecisionReason: verdict.permissionDecisionReason });
  const contexts = outputs.map((output) => output.additionalContext).filter(Boolean);
  if (contexts.length > 0) merged.additionalContext = contexts.join('\n');
  const output = Object.keys(merged).length === 1 ? null : { hookSpecificOutput: merged };
  return withReceipt(output, hookInput, verdict, undefined, enabled);
}

if (isMain(import.meta.url)) {
  try {
    const text = await readHookText();
    const output = text.trim() === '' ? null : await dispatchBash(JSON.parse(text));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
