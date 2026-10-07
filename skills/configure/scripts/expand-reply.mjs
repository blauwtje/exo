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
import { SCHEMA, settingValue } from '#settings-store';
import { isMain } from '#script-flags';

const EXPANSION_INSTRUCTION =
  'The user sent a lone "?": restate your last reply in full sentences, with every step, reason and term written out, and no shortened wording.';

// The reminder quotes the ban, keep-whole and exemption sentences of the schema's
// terse rule rather than restating them, so the two lists cannot drift apart.
function terseRuleSentence(ending) {
  const sentence = SCHEMA.replies.rules.terse.match(new RegExp(`[A-Z][^."]*${ending}\\.`));
  if (sentence === null) throw new Error(`the terse rule has no sentence ending "${ending}."`);
  return sentence[0];
}

function terseReminder() {
  return `replies=terse: ${terseRuleSentence('are fine')} ${terseRuleSentence('stay whole')} ${terseRuleSentence('keep normal prose')}`;
}

function contextFor(prompt) {
  if (prompt.trim() === '?') return EXPANSION_INSTRUCTION;
  if (settingValue('replies') !== 'terse') return null;
  return terseReminder();
}

export function expandReply(hookInput) {
  if (typeof hookInput.prompt !== 'string') return null;
  const additionalContext = contextFor(hookInput.prompt);
  if (additionalContext === null) return null;
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
}

if (isMain(import.meta.url)) {
  try {
    const output = expandReply(JSON.parse(await readHookText()));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    console.error(`expand-reply: ${error.message}`);
  }
}
