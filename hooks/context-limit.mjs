#!/usr/bin/env node

import process from 'node:process';
import { readHookText } from '#hook-input';
import { contextDecision, contextFields } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

if (isMain(import.meta.url)) {
  try {
    const output = contextFields(contextDecision(JSON.parse(await readHookText())));
    if (output) process.stdout.write(`${JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', ...output } })}\n`);
  } catch {
  }
}
