#!/usr/bin/env node
// Restates the skill rules in a long session. hooks/session-start.sh hands
// the using-exo body over once, and every tool result after it pushes that
// text further from the turn that needs it. On each prompt this hook measures
// how far the transcript grew since the rules were last in front of the model,
// and past RESTATE_INTERVAL_BYTES it sends the sections lib/restatement.mjs
// names, read from the skill file at that moment. Only the main thread is
// measured, because a delegate shares the session id while holding a context
// of its own. The measuring point lives in the savings record, so
// EXO_SAVINGS=off or `enabled: false` restates nothing.
//
//   node restate.mjs         UserPromptSubmit hook: stdin is the hook JSON
//   node restate.mjs reset   SessionStart hook: the whole body was just injected
//
// A restatement fault never blocks a prompt: any error exits 0 with nothing on
// stdout. A fault after the measuring point moved costs one restatement.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { RESTATED_SKILL, RESTATE_INTERVAL_BYTES, restatementText } from '#restatement';
import { savingsEnabled, updateHotSession } from './record.mjs';

const PLUGIN_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

// The session this call measures, or null when there is none to measure.
function measuredSession(hookInput) {
  if (!savingsEnabled()) return null;
  if (typeof hookInput.session_id !== 'string') return null;
  if (typeof hookInput.agent_id === 'string') return null;
  if (typeof hookInput.transcript_path !== 'string') return null;
  return hookInput.session_id;
}

// A transcript not written yet measures 0, which is where a new session starts.
function transcriptBytes(transcriptPath) {
  try {
    return fs.statSync(transcriptPath).size;
  } catch (error) {
    if (error.code === 'ENOENT') return 0;
    throw error;
  }
}

function reset(hookInput) {
  const sessionId = measuredSession(hookInput);
  if (sessionId === null) return;
  const bytes = transcriptBytes(hookInput.transcript_path);
  updateHotSession(sessionId, (session) => {
    session.restate.baseline = bytes;
    return true;
  });
}

function restate(hookInput) {
  const sessionId = measuredSession(hookInput);
  if (sessionId === null) return;
  const bytes = transcriptBytes(hookInput.transcript_path);
  let due = false;
  updateHotSession(sessionId, (session) => {
    const baseline = session.restate.baseline;
    // A row with no measuring point yet, or a transcript that restarted
    // smaller, starts measuring here.
    if (!Number.isSafeInteger(baseline) || bytes < baseline) {
      session.restate.baseline = bytes;
      return true;
    }
    if (bytes - baseline < RESTATE_INTERVAL_BYTES) return false;
    session.restate.baseline = bytes;
    due = true;
    return true;
  });
  if (!due) return;
  const skillText = fs.readFileSync(path.join(PLUGIN_ROOT, RESTATED_SKILL), 'utf8');
  const hookSpecificOutput = { hookEventName: 'UserPromptSubmit', additionalContext: restatementText(skillText) };
  process.stdout.write(`${JSON.stringify({ hookSpecificOutput })}\n`);
}

try {
  const hookInput = JSON.parse(fs.readFileSync(0, 'utf8'));
  if (process.argv[2] === 'reset') reset(hookInput);
  else restate(hookInput);
} catch (error) {
  console.error(`restate: ${error.message}`);
}
