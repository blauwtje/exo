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

import { realpathSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { readHookText } from '#hook-input';
import { chatProse, scoreProse } from '#prose-density';
import { settingValue } from '#settings-store';
import { feedbackFor, readTerseState, writeTerseState } from '#terse-feedback';

const MIN_WORDS = 25;

function isExempt(reply) {
  return scoreProse(reply).words < MIN_WORDS || reply.trim().endsWith('?') || chatProse(reply).trim().endsWith('?');
}

// Always null: the hook keeps its state on disk and never blocks a reply.
export function stopHook(hookInput) {
  const reply = hookInput.last_assistant_message;
  const sessionId = hookInput.session_id;
  const skip = hookInput.stop_hook_active === true || typeof reply !== 'string' || settingValue('replies') !== 'terse';
  const state = skip ? null : readTerseState(sessionId);
  if (state !== null && !state.expand && !isExempt(reply)) {
    const feedback = feedbackFor(reply);
    if (feedback !== null) writeTerseState(sessionId, { expand: false, feedback });
  }
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try {
    stopHook(JSON.parse(await readHookText()));
  } catch (error) {
    console.error(`terse-check: ${error.message}`);
  }
}
