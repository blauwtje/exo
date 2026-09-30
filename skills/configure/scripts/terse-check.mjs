#!/usr/bin/env node
// Stop hook: under `replies=terse`, scores the last reply and keeps the rate
// and one tightened sentence in the session's feedback state when the reply
// runs over the article limit; the reminder hook shows it on the next prompt.
// It never blocks a reply and prints nothing.
//
// A turn is skipped when the hook is already continuing a turn, when the reply
// answers a lone `?` (the state's `expand` flag), when it has under 25 chat
// words, or when its last sentence ends in `?`, which covers a question to the
// user and most confirmations before an irreversible action.
//
// A fault never blocks a turn: any error exits 0 with nothing on stdout.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { chatProse, scoreProse } from '#prose-density';
import { settingValue } from '#settings-store';
import { feedbackFor, readTerseState, writeTerseState } from '#terse-feedback';

const MIN_WORDS = 25;

function isExempt(reply) {
  return scoreProse(reply).words < MIN_WORDS || reply.trim().endsWith('?') || chatProse(reply).trim().endsWith('?');
}

try {
  const hookInput = JSON.parse(await readHookText());
  const reply = hookInput.last_assistant_message;
  const sessionId = hookInput.session_id;
  const skip = hookInput.stop_hook_active === true || typeof reply !== 'string' || settingValue('replies') !== 'terse';
  const state = skip ? null : readTerseState(sessionId);
  if (state !== null && !state.expand && !isExempt(reply)) {
    const feedback = feedbackFor(reply);
    if (feedback !== null) writeTerseState(sessionId, { expand: false, feedback });
  }
} catch (error) {
  console.error(`terse-check: ${error.message}`);
}
