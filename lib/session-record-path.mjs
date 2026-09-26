// The hot session record's path: `<savings-dir>/sessions/<id>.json`, and the
// session id shape that becomes the file name. show-savings' record.mjs
// writes the file there; route-skills' next-stage.mjs only reads whether
// context-watch.mjs marked the session warned. One module owns the layout so
// a change to it cannot leave the reader silently reading nothing.
// Imported as `#session-record-path`.

import path from 'node:path';
import process from 'node:process';
import { configDirectory } from '#config-directory';

// A session id becomes a file name, so only the shape transcript.mjs already
// accepts for the same purpose is allowed.
const SESSION_ID = /^[\w-]+$/;

export function isSessionId(sessionId) {
  return SESSION_ID.test(sessionId);
}

// EXO_SAVINGS_DIR relocates the record and its config alone, so a benchmark
// cell keeps its own record while the session keeps its login and settings.
export function savingsDirectory() {
  return process.env.EXO_SAVINGS_DIR || path.join(configDirectory(), 'exo', 'savings');
}

export function hotSessionFile(sessionId) {
  if (!isSessionId(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  return path.join(savingsDirectory(), 'sessions', `${sessionId}.json`);
}
