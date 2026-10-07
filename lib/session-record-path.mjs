// The session id shape that becomes a file name.
// Imported as `#session-record-path`.

// A session id becomes a file name, so only the shape transcript.mjs already
// accepts for the same purpose is allowed.
const SESSION_ID = /^[\w-]+$/;

export function isSessionId(sessionId) {
  return SESSION_ID.test(sessionId);
}
