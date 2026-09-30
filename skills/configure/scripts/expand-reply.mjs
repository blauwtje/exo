#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that is a lone `?` asks for the last reply
// again in full, because the terse reply level cuts prose the user may want
// back. Under `replies=terse` any other prompt gets a one-line reminder of the
// level, because the session rule fades over a long chat and after compaction.
// With any other level, any other prompt prints nothing.
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';

const EXPANSION_INSTRUCTION =
  'The user sent a lone "?": restate your last reply in full sentences, with every step, reason and term written out, and no shortened wording.';

const TERSE_REMINDER =
  'replies=terse: chat prose drops articles, linking verbs, filler. Code, commands, paths, error text, numbers, every not/no/only/except stay whole. Commits, PR text, docs, code comments: full prose.';

function contextFor(prompt) {
  if (prompt.trim() === '?') return EXPANSION_INSTRUCTION;
  if (settingValue('replies') === 'terse') return TERSE_REMINDER;
  return null;
}

try {
  const hookInput = JSON.parse(await readHookText());
  const additionalContext = typeof hookInput.prompt === 'string' ? contextFor(hookInput.prompt) : null;
  if (additionalContext !== null) {
    const hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext };
    process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
  }
} catch (error) {
  console.error(`expand-reply: ${error.message}`);
}
