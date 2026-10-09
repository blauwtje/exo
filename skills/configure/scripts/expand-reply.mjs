#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that is a lone `?` asks for the last reply
// again in full, because a compressed reply cuts prose the user may want back.
// Any other prompt prints nothing. The `compression` rules carry the same `?`
// rule, so this hook is the fallback until the entry is removed.
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { isMain } from '#script-flags';

const EXPANSION_INSTRUCTION =
  'The user sent a lone "?": restate your last reply in full sentences, with every step, reason and term written out, and no shortened wording.';

export function expandReply(hookInput) {
  if (typeof hookInput.prompt !== 'string' || hookInput.prompt.trim() !== '?') return null;
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: EXPANSION_INSTRUCTION } };
}

if (isMain(import.meta.url)) {
  try {
    const output = expandReply(JSON.parse(await readHookText()));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    console.error(`expand-reply: ${error.message}`);
  }
}
