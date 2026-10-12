const SESSION_ID = /^[\w-]+$/;

export function isSessionId(sessionId) {
  return SESSION_ID.test(sessionId);
}
