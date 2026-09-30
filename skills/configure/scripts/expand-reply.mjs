#!/usr/bin/env node
// UserPromptSubmit hook: a prompt that is a lone `?` asks for the last reply
// again in full, because the terse reply level cuts prose the user may want
// back. Under `replies=terse` any other prompt gets a one-line reminder of the
// level, because the session rule fades over a long chat and after compaction.
// With any other level, any other prompt prints nothing.
//
// The prompt also keeps the per-session terse state that the Stop hook reads
// and writes: a lone `?` sets `expand` so the reply to it goes unscored, and
// any other prompt clears `expand` and the pending feedback. Under terse that
// feedback is appended to the reminder once, as a note naming the last score.
//
// A fault never blocks a prompt: any error exits 0 with nothing on stdout.

import fs from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readHookText } from '#hook-input';
import { SCHEMA, settingValue } from '#settings-store';
import { ARTICLE_LIMIT, readTerseState, writeTerseState } from '#terse-feedback';

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

// A phrase is cut to 20 characters, so the note is at most 360 characters: 60
// of frame, 120 of tightened sentence, 160 of stray phrases.
function terseNote({ rate, sentence, phrases = [] }) {
  const score = `Last reply: ${rate.toFixed(1)} articles/100 words, limit ${ARTICLE_LIMIT.toFixed(1)}.`;
  const stray = phrases.length === 0 ? '' : ` Stray: ${phrases.map((phrase) => phrase.slice(0, 20)).join(', ')}.`;
  return `${score}${stray} Tighter: "${sentence}"`;
}

// A state-write failure must not drop the instruction or the reminder.
function saveState(sessionId, state) {
  try {
    writeTerseState(sessionId, state);
  } catch (error) {
    console.error(`expand-reply: ${error.message}`);
  }
}

function contextFor(sessionId, prompt) {
  const state = readTerseState(sessionId);
  if (prompt.trim() === '?') {
    saveState(sessionId, { expand: true, feedback: state.feedback, display: state.display });
    return EXPANSION_INSTRUCTION;
  }
  saveState(sessionId, { expand: false, feedback: null, display: state.display });
  if (settingValue('replies') !== 'terse') return null;
  const reminder = terseReminder();
  return state.feedback === null ? reminder : `${reminder} ${terseNote(state.feedback)}`;
}

export function expandReply(hookInput) {
  if (typeof hookInput.prompt !== 'string') return null;
  const additionalContext = contextFor(hookInput.session_id, hookInput.prompt);
  if (additionalContext === null) return null;
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  try {
    const output = expandReply(JSON.parse(await readHookText()));
    if (output !== null) process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    console.error(`expand-reply: ${error.message}`);
  }
}
