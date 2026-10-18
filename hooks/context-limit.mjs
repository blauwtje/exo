#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields, persistedReadDecision } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

if (isMain(import.meta.url)) {
  try {
    const input = JSON.parse(await readHookText());
    const output = contextFields(persistedReadDecision(input) ?? contextDecision(input));
    if (output) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...output } })}\n`);
  } catch {
  }
}
