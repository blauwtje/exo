#!/usr/bin/env node
// PreToolUse hook on the tools the Bash and Agent dispatchers do not cover:
// prints the context check as PreToolUse JSON, nothing when under the soft limit.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

if (isMain(import.meta.url)) {
  try {
    const output = contextFields(contextDecision(JSON.parse(await readHookText())));
    if (output) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...output } })}\n`);
  } catch {
    // Unreadable input leaves the call as it is.
  }
}
