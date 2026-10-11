#!/usr/bin/env node
// PreToolUse hook on Agent: raises a dispatch of `exo:find-open-points` from its
// pinned `high` to the session's effort when that is `xhigh` or `max`.
// A dispatch already at or above that level, or anything else, prints nothing
// unless the context check speaks.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

export function agentEffort({ tool_name: tool, tool_input: input, effort } = {}) {
  const level = effort?.level;
  if (tool !== 'Agent' || input?.subagent_type !== 'exo:find-open-points' || !['xhigh', 'max'].includes(level) || [level, 'max'].includes(input.effort)) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...input, effort: level } } };
}

// The effort raise joined with the context check: a context deny wins over the
// allow, else the context text rides along.
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
    // Unreadable input leaves the dispatch as it is.
  }
}
