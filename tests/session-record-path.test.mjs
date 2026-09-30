// #session-record-path owns the guards' session file path and the session id
// shape that becomes its file name, so every reader and lib/session-store.mjs
// use the same file for the same id.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { isSessionId, sessionFile, sessionsDirectory } from '../lib/session-record-path.mjs';

function withEnv(name, value, work) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return work();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('isSessionId accepts word characters and hyphens only', () => {
  assert.equal(isSessionId('notified-session'), true);
  assert.equal(isSessionId('abc_123'), true);
  assert.equal(isSessionId('../x'), false);
  assert.equal(isSessionId('with space'), false);
});

test('sessionsDirectory follows EXO_SESSIONS_DIR, then the config directory', () => {
  withEnv('EXO_SESSIONS_DIR', '/tmp/exo-sessions-fixture', () => {
    assert.equal(sessionsDirectory(), '/tmp/exo-sessions-fixture');
  });
  withEnv('EXO_SESSIONS_DIR', undefined, () => {
    withEnv('CLAUDE_CONFIG_DIR', '/tmp/exo-config-fixture', () => {
      assert.equal(sessionsDirectory(), path.join('/tmp/exo-config-fixture', 'exo', 'sessions'));
    });
  });
});

test('sessionFile joins the sessions directory and the id as a file name, and rejects a path escape', () => {
  withEnv('EXO_SESSIONS_DIR', '/tmp/exo-sessions-fixture', () => {
    assert.equal(sessionFile('notified-session'), path.join('/tmp/exo-sessions-fixture', 'notified-session.json'));
    assert.throws(() => sessionFile('../x'), /invalid session id/);
  });
});
