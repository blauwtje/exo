#!/usr/bin/env node
// The one UserPromptSubmit hook: runs the nudge and expand-reply handlers
// in that order on a single parse of the hook input, and writes one
// output whose additionalContext joins their strings with a blank line. Each
// handler runs in its own try/catch, so a fault in one costs only that
// handler's context and never blocks the prompt or the other one.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { expandReply } from '../skills/configure/scripts/expand-reply.mjs';
import { nudge } from '../skills/remember/scripts/nudge.mjs';
import { isProcessEntry } from './guards/guard-runner.mjs';

const HANDLERS = [
  ['nudge', nudge],
  ['expand-reply', expandReply]
];

// The joined additionalContext of every handler that speaks, or null.
export function dispatchPrompt(hookInput) {
  const contexts = [];
  for (const [name, handler] of HANDLERS) {
    try {
      const context = handler(hookInput)?.hookSpecificOutput?.additionalContext;
      if (typeof context === 'string' && context !== '') contexts.push(context);
    } catch (error) {
      console.error(`dispatch-prompt: ${name}: ${error.message}`);
    }
  }
  if (contexts.length === 0) return null;
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: contexts.join('\n\n') } };
}

if (isProcessEntry(import.meta.url)) {
  try {
    const output = dispatchPrompt(JSON.parse(await readHookText()));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    console.error(`dispatch-prompt: ${error.message}`);
  }
}
