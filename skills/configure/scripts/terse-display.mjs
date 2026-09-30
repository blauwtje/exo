#!/usr/bin/env node
// MessageDisplay hook: under `replies=terse`, removes stray articles from the
// chat lines of each streamed delta before the user reads them. The filter is
// display-only: the transcript, the model's context and the Stop hook's
// `last_assistant_message` keep the original text.
//
// The fence state of a message lives in the session's terse state as
// `display: { messageId, inFence }`: a new `message_id` starts outside a fence
// and the `final` flush clears it. The hook prints `displayContent` only when
// the text changed, and prints nothing for the reply to a lone `?`.
//
// A fault never changes the display: any error exits 0 with nothing on stdout,
// so Claude Code shows the original delta.

import process from 'node:process';
import { readHookText } from '#hook-input';
import { settingValue } from '#settings-store';
import { stripArticles } from '#terse-display';
import { readTerseState, writeTerseState } from '#terse-feedback';

try {
  const hookInput = JSON.parse(await readHookText());
  const { session_id: sessionId, message_id: messageId, delta, final } = hookInput;
  const skip = typeof delta !== 'string' || typeof messageId !== 'string' || settingValue('replies') !== 'terse';
  const state = skip ? null : readTerseState(sessionId);
  if (state !== null && !state.expand) {
    const sameMessage = state.display !== null && state.display.messageId === messageId;
    const result = stripArticles(delta, sameMessage && state.display.inFence);
    const display = final === true ? null : { messageId, inFence: result.inFence };
    writeTerseState(sessionId, { expand: false, feedback: state.feedback, display });
    if (result.text !== delta) {
      const hookSpecificOutput = { hookEventName: 'MessageDisplay', displayContent: result.text };
      process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
    }
  }
} catch (error) {
  console.error(`terse-display: ${error.message}`);
}
