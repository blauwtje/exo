#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that is a lone `?` asks for the last reply
// again in full, because the terse reply level cuts prose the user may want
// back. Any other prompt prints nothing.
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout.

import process from 'node:process';
import { readHookText } from '#hook-input';

const EXPANSION_INSTRUCTION =
  'The user sent a lone "?": restate your last reply in full sentences, with every step, reason and term written out, and no shortened wording.';

try {
  const hookInput = JSON.parse(await readHookText());
  if (typeof hookInput.prompt === 'string' && hookInput.prompt.trim() === '?') {
    const hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext: EXPANSION_INSTRUCTION };
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
  }
} catch (error) {
  console.error(`expand-reply: ${error.message}`);
}
