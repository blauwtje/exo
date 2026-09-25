#!/usr/bin/env node
// UserPromptSubmit hook: a prompt carrying a correction marker gets one
// sentence naming the book command, and every fire is logged with the marker
// that fired it. The hook decides nothing. It cannot tell a correction of a
// repository fact from a correction of the task, so the session reads the
// prompt and books only the first kind, and /exo:remember books what this misses.
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
import { appendNudgeLog, nudgeLogFile } from '#memory-store';

const MEMORY_SCRIPT = fileURLToPath(new URL('./memory.mjs', import.meta.url));
const BOOK_COMMAND = `node "${MEMORY_SCRIPT}" book`;

// What may follow BOOK_COMMAND in an approved call: the three flags the nudge
// prints, each with a double-quoted value. A value holds no double quote,
// dollar sign, backtick, backslash or line break, because those are what the
// shell expands or what ends the quotes, so an approved call runs memory.mjs
// and nothing else. A quote that needs one of them gets the permission prompt.
const BOOK_ARGUMENTS = /^(?: --(?:claim|quote|session) "[^"$`\\\r\n]*")+$/;

// Measured against 261 prompts typed in this repository's own history: this
// list fires on about 4% of them, and roughly one fire in ten is a correction.
// A false fire costs one sentence the session ignores; a miss costs the fact
// outright, so the list starts wide and nudge-log.jsonl records which entry
// fired, which is the data a later change narrows it on.
const MARKERS = [
  /\bno,/i,
  /\bnope\b/i,
  /\bactually\b/i,
  /\bwrong\b/i,
  /\bincorrect\b/i,
  /\bnot true\b/i,
  /\bthat'?s not\b/i,
  /\bisn'?t\b/i,
  /\bis not\b/i,
  /\bdoesn'?t\b/i,
  /\bdoes not\b/i,
  /\bmistaken\b/i,
  /\bnee,/i,
  /\bdat klopt niet\b/i,
  /\bniet waar\b/i,
  /\bfout:/i,
  /\beigenlijk\b/i
];

// How much of the prompt the log keeps: enough to judge a false fire while
// tuning the list, short enough that the log stays cheap to read.
const LOGGED_PROMPT_CHARS = 160;

function firedMarker(prompt) {
  return MARKERS.find((marker) => marker.test(prompt)) ?? null;
}

function nudge(hookInput) {
  // A delegate shares the session id while holding a context of its own, so it
  // cannot book the session's correction; only the main thread is nudged.
  if (typeof hookInput.agent_id === 'string') return;
  if (typeof hookInput.prompt !== 'string') return;
  const session = typeof hookInput.session_id === 'string' ? hookInput.session_id : '';
  const cwd = typeof hookInput.cwd === 'string' && hookInput.cwd !== '' ? hookInput.cwd : process.cwd();
  const marker = firedMarker(hookInput.prompt);
  if (marker === null) return;
  appendNudgeLog(cwd, {
    event: 'nudged',
    session,
    marker: marker.source,
    prompt: hookInput.prompt.slice(0, LOGGED_PROMPT_CHARS)
  });
  const command = `${BOOK_COMMAND} --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "${session}"`;
  const additionalContext = `exo: this prompt may correct a repository fact. When it does, book it with \`${command}\`, quoting no password, token or key. When it corrects no repository fact, ignore this line and write nothing about it.`;
  const hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}

function approve(hookInput) {
  if (hookInput.tool_name !== 'Bash') return;
  const command = hookInput.tool_input?.command;
  if (typeof command !== 'string') return;
  if (!command.startsWith(BOOK_COMMAND)) return;
  const bookArguments = command.slice(BOOK_COMMAND.length);
  if (!BOOK_ARGUMENTS.test(bookArguments)) return;
  const hookSpecificOutput = {
    hookEventName: 'PreToolUse',
    permissionDecision: 'allow',
    permissionDecisionReason: 'exo: books a correction into this repository\'s memory'
  };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
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
// also one /exo:remember made with no nudge, and counting those would tune the
// marker list on bookings the markers never caused and push the rate past 100%.
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
  const perMarker = new Map();
  for (const entry of nudged) perMarker.set(entry.marker, (perMarker.get(entry.marker) ?? 0) + 1);
  const ranked = [...perMarker].sort((first, second) => second[1] - first[1]);
  for (const [marker, count] of ranked) console.log(`  ${marker}: ${count}`);
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { cwd: { type: 'string' } } });
  if (positionals[0] === 'stats') {
    stats(values.cwd ?? process.cwd());
  } else if (positionals[0] === 'approve') {
    approve(JSON.parse(fs.readFileSync(0, 'utf8')));
  } else {
    nudge(JSON.parse(fs.readFileSync(0, 'utf8')));
  }
} catch (error) {
  console.error(`nudge: ${error.message}`);
}
