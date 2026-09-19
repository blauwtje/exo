#!/usr/bin/env node
// UserPromptSubmit hook: a prompt carrying a correction marker gets one
// sentence naming the book command, and every fire is logged with the marker
// that fired it. The hook decides nothing. It cannot tell a correction of a
// repository fact from a correction of the task, so the session reads the
// prompt and books only the first kind, and /exo:memory books what this misses.
//
//   node nudge.mjs                UserPromptSubmit hook: stdin is the hook JSON
//   node nudge.mjs stats --cwd .  print fires, bookings and the hit rate
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout.

import fs from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { appendNudgeLog, nudgeLogFile } from '#memory-store';

const MEMORY_SCRIPT = fileURLToPath(new URL('./memory.mjs', import.meta.url));

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
  /\bmistaken\b/i
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
  const command = `node "${MEMORY_SCRIPT}" book --claim "<one sentence>" --quote "<the user's words, verbatim>" --session "${session}"`;
  const additionalContext = `exo: this prompt may correct a repository fact. When it does, book it with \`${command}\`, quoting no password, token or key. When it corrects no repository fact, ignore this line and write nothing about it.`;
  const hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext };
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

function stats(cwd) {
  const entries = readLog(cwd).map((line) => JSON.parse(line));
  const nudged = entries.filter((entry) => entry.event === 'nudged');
  const booked = entries.filter((entry) => entry.event === 'booked');
  const rate = nudged.length === 0 ? 0 : Math.round((100 * booked.length) / nudged.length);
  console.log(`${nudged.length} nudged, ${booked.length} booked, ${rate}% hit rate`);
  const perMarker = new Map();
  for (const entry of nudged) perMarker.set(entry.marker, (perMarker.get(entry.marker) ?? 0) + 1);
  const ranked = [...perMarker].sort((first, second) => second[1] - first[1]);
  for (const [marker, count] of ranked) console.log(`  ${marker}: ${count}`);
}

try {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { cwd: { type: 'string' } } });
  if (positionals[0] === 'stats') {
    stats(values.cwd ?? process.cwd());
  } else {
    nudge(JSON.parse(fs.readFileSync(0, 'utf8')));
  }
} catch (error) {
  console.error(`nudge: ${error.message}`);
}
