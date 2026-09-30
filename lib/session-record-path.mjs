// The guards' session file path: `<config>/exo/sessions/<id>.json`, and the
// session id shape that becomes the file name. lib/session-store.mjs writes
// the file there. One module owns the layout so a change to it cannot leave a
// reader silently reading nothing.
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

// EXO_SESSIONS_DIR relocates the guards' session files alone, so a benchmark
// cell keeps its own while the session keeps its login and settings.
export function sessionsDirectory() {
  return process.env.EXO_SESSIONS_DIR || path.join(configDirectory(), 'exo', 'sessions');
}

export function sessionFile(sessionId) {
  if (!isSessionId(sessionId)) throw new Error(`invalid session id: ${sessionId}`);
  return path.join(sessionsDirectory(), `${sessionId}.json`);
}
