#!/usr/bin/env node

import process from 'node:process';
import { subagentStartNote } from '../lib/context-limits.mjs';
import { inSidecall } from '#hook-input';
import { isMain } from '../lib/script-flags.mjs';

export function subagentStart() {
  return { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: subagentStartNote() } };
}

if (isMain(import.meta.url) && !inSidecall()) process.stdout.write(`${JSON.stringify(subagentStart())}\n`);
