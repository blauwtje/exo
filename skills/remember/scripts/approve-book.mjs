#!/usr/bin/env node
// The book command a session runs when the user corrects a repository fact:
// hooks/session-start.mjs prints it once per session through bookSentence, and
// approve allows exactly that command as a PreToolUse hook on Bash.
//
//   node approve-book.mjs   PreToolUse hook on Bash: stdin is the hook JSON
//
// A plugin cannot ship a permission rule, and a rule a user writes names the
// installed path, which changes with every release. So approve allows the one
// command bookSentence prints and says nothing about any other, which leaves
// the user's own rules and the permission prompt to decide those.
//
// A fault exits 0 with nothing on stdout, which approves nothing.

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { readHookText } from '#hook-input';
import { isMain } from '#script-flags';

const MEMORY_SCRIPT = fileURLToPath(new URL('./memory.mjs', import.meta.url));
const BOOK_COMMAND = `node "${MEMORY_SCRIPT}" book`;

// What may follow BOOK_COMMAND in an approved call: the three flags
// bookSentence prints, each with a double-quoted value. A value holds no double
// quote, dollar sign, backtick, backslash or line break, because those are what
// the shell expands or what ends the quotes, so an approved call runs memory.mjs
// and nothing else. A quote that needs one of them gets the permission prompt.
const BOOK_ARGUMENTS = /^(?: --(?:claim|quote|session) "[^"$`\\\r\n]*")+$/;

// The once-per-session sentence, or null when the session id is missing or
// would make the printed command one approve refuses.
export function bookSentence(session) {
  if (typeof session !== 'string' || session === '' || !BOOK_ARGUMENTS.test(` --session "${session}"`)) return null;
  const command = `${BOOK_COMMAND} --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "${session}"`;
  return `When the user corrects a repository fact, in any language, run \`${command}\`, quoting no password, token or key.`;
}

export function approve(hookInput) {
  if (hookInput.tool_name !== 'Bash') return null;
  const command = hookInput.tool_input?.command;
  if (typeof command !== 'string') return null;
  if (!command.startsWith(BOOK_COMMAND)) return null;
  const bookArguments = command.slice(BOOK_COMMAND.length);
  if (!BOOK_ARGUMENTS.test(bookArguments)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
      permissionDecisionReason: 'exo: books a correction into this repository\'s memory'
    }
  };
}

if (isMain(import.meta.url)) {
  try {
    const output = approve(JSON.parse(await readHookText()));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    console.error(`approve-book: ${error.message}`);
  }
}
