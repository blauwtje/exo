#!/usr/bin/env node
// PreToolUse hook on Agent: raises a dispatch of `exo:find-open-points` from its
// pinned `high` to the session's effort when that is `xhigh` or `max`.
// Anything else prints nothing, so the pinned floor stays.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { isMain } from '../lib/script-flags.mjs';

export function agentEffort({ tool_name: tool, tool_input: input, effort } = {}) {
  const level = effort?.level;
  if (tool !== 'Agent' || input?.subagent_type !== 'exo:find-open-points' || !['xhigh', 'max'].includes(level)) return null;
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: { ...input, effort: level } } };
}

if (isMain(import.meta.url)) {
  try {
    const output = agentEffort(JSON.parse(await readHookText()));
    if (output) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch {
    // Unreadable input leaves the dispatch as it is.
  }
}
