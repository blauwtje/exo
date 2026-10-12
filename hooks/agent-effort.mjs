#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

export function agentEffort({ tool_name: tool, tool_input: input, effort } = {}) {
  const level = effort?.level;
  if (tool !== 'Agent' || input?.subagent_type !== 'exo:find-open-points' || !['xhigh', 'max'].includes(level) || [level, 'max'].includes(input.effort)) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...input, effort: level } } };
}

export function agentHook(hookInput) {
  const output = agentEffort(hookInput);
  const fields = contextFields(contextDecision(hookInput));
  if (!fields) return output;
  if (fields.permissionDecision) return { hookSpecificOutput: { hookEventName: 'PreToolUse', ...fields } };
  const base = output ?? { hookSpecificOutput: { hookEventName: 'PreToolUse' } };
  return { hookSpecificOutput: { ...base.hookSpecificOutput, ...fields } };
}

if (isMain(import.meta.url)) {
  try {
    const output = agentHook(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
  }
}
