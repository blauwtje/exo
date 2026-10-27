#!/usr/bin/env node

import process from 'node:process';
import { subagentStartNote } from '../lib/context-limits.mjs';
import { isMain } from '../lib/script-flags.mjs';

export function subagentStart() {
  return { hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: subagentStartNote() } };
}

if (isMain(import.meta.url)) process.stdout.write(`${JSON.stringify(subagentStart())}\n`);
