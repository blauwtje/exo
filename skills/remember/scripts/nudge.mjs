#!/usr/bin/env node
// UserPromptSubmit hook: every main-thread prompt that could hold a
// correction gets one sentence naming the book command, and every fire is
// logged. The hook decides nothing. No word list tells a correction apart in
// every language the user may type, so the session reads the prompt, books
// only a correction of a repository fact, and /exo:remember books what it misses.
//
//   node nudge.mjs                UserPromptSubmit hook: stdin is the hook JSON
//   node nudge.mjs approve        PreToolUse hook on Bash: allows that book command
//   node nudge.mjs stats --cwd .  print fires, bookings and the hit rate
//
// A plugin cannot ship a permission rule, and a rule a user writes names the
// installed path, which changes with every release. So approve allows the one
// command this file prints and says nothing about any other, which leaves the
// user's own rules and the permission prompt to decide those.
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout, and
// for approve that means no approval.

import fs from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readHookText } from '#hook-input';
import { appendNudgeLog, nudgeLogFile } from '#memory-store';
import { isMain } from '#script-flags';

const MEMORY_SCRIPT = fileURLToPath(new URL('./memory.mjs', import.meta.url));
const BOOK_COMMAND = `node "${MEMORY_SCRIPT}" book`;

// What may follow BOOK_COMMAND in an approved call: the three flags the nudge
// prints, each with a double-quoted value. A value holds no double quote,
// dollar sign, backtick, backslash or line break, because those are what the
// shell expands or what ends the quotes, so an approved call runs memory.mjs
// and nothing else. A quote that needs one of them gets the permission prompt.
const BOOK_ARGUMENTS = /^(?: --(?:claim|quote|session) "[^"$`\\\r\n]*")+$/;

// How much of the prompt the log keeps: enough to judge a fire that booked
// nothing, short enough that the log stays cheap to read.
const LOGGED_PROMPT_CHARS = 160;

// A prompt with no letter or digit, such as an empty one or a lone `?`, holds
// no fact to correct, whatever the language.
const HAS_WORD = /[\p{L}\p{N}]/u;

// A slash command with no arguments carries no words of the user's own: typed
// as `/clear`, or as the harness's tag form with an empty <command-args>.
const BARE_SLASH_COMMAND = /^\/\S+$/;
const COMMAND_TAG = /<command-(message|name)>[^<]*<\/command-\1>/g;
const EMPTY_COMMAND_ARGS = /<command-args>\s*<\/command-args>/;

function isBareCommand(prompt) {
  const text = prompt.trim();
  if (BARE_SLASH_COMMAND.test(text)) return true;
  if (!text.includes('<command-name>') || !EMPTY_COMMAND_ARGS.test(text)) return false;
  return text.replace(COMMAND_TAG, '').replace(EMPTY_COMMAND_ARGS, '').trim() === '';
}

// A background-agent completion arrives as a prompt, not as user input: the
// harness wraps it in this marker or a <task-notification> block, and its
// result text can read like a correction yet names no fact the user stated,
// so it is never nudged.
const HARNESS_NOTIFICATION = /\[SYSTEM NOTIFICATION - NOT USER INPUT\]|<task-notification>/;

export function nudge(hookInput) {
  // A delegate shares the session id while holding a context of its own, so it
  // cannot book the session's correction; only the main thread is nudged.
  if (typeof hookInput.agent_id === 'string') return null;
  if (typeof hookInput.prompt !== 'string') return null;
  const { prompt } = hookInput;
  if (!HAS_WORD.test(prompt) || isBareCommand(prompt)) return null;
  if (HARNESS_NOTIFICATION.test(prompt)) return null;
  const session = typeof hookInput.session_id === 'string' ? hookInput.session_id : '';
  const cwd = typeof hookInput.cwd === 'string' && hookInput.cwd !== '' ? hookInput.cwd : process.cwd();
  appendNudgeLog(cwd, { event: 'nudged', session, prompt: prompt.slice(0, LOGGED_PROMPT_CHARS) });
  const command = `${BOOK_COMMAND} --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "${session}"`;
  const additionalContext = `exo: only if this prompt corrects a repository fact, run \`${command}\`, quoting no password, token or key; otherwise say nothing about this.`;
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
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

function readLog(cwd) {
  try {
    return fs.readFileSync(nudgeLogFile(cwd), 'utf8').split('\n').filter((line) => line !== '');
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

// A booking is a hit only when a nudge in its session came before it and no
// earlier booking already answered that nudge. memory.mjs logs every booking,
// also one /exo:remember made with no nudge, and counting those would credit
// the nudge with bookings it never caused and push the rate past 100%.
function countHits(entries) {
  const openNudges = new Map();
  let hits = 0;
  for (const entry of entries) {
    const open = openNudges.get(entry.session) ?? 0;
    if (entry.event === 'nudged') openNudges.set(entry.session, open + 1);
    if (entry.event === 'booked' && open > 0) {
      openNudges.set(entry.session, open - 1);
      hits += 1;
    }
  }
  return hits;
}

function stats(cwd) {
  const entries = readLog(cwd).map((line) => JSON.parse(line));
  const nudged = entries.filter((entry) => entry.event === 'nudged');
  const hits = countHits(entries);
  const rate = nudged.length === 0 ? 0 : Math.round((100 * hits) / nudged.length);
  console.log(`${nudged.length} nudged, ${hits} booked, ${rate}% hit rate`);
}

if (isMain(import.meta.url)) {
  try {
    const { values, positionals } = parseArgs({ allowPositionals: true, options: { cwd: { type: 'string' } } });
    if (positionals[0] === 'stats') {
      stats(values.cwd ?? process.cwd());
    } else {
      const handler = positionals[0] === 'approve' ? approve : nudge;
      const output = handler(JSON.parse(await readHookText()));
      if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
    }
  } catch (error) {
    console.error(`nudge: ${error.message}`);
  }
}
