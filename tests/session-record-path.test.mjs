// #session-record-path owns the hot session record's path and the session id
// shape that becomes its file name, so record.mjs and route-skills'
// next-stage.mjs read the same file for the same id.

import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { hotSessionFile, isSessionId, savingsDirectory } from '../lib/session-record-path.mjs';

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
  assert.equal(isSessionId('warned-session'), true);
  assert.equal(isSessionId('abc_123'), true);
  assert.equal(isSessionId('../x'), false);
  assert.equal(isSessionId('with space'), false);
});

test('savingsDirectory follows EXO_SAVINGS_DIR, then the config directory', () => {
  withEnv('EXO_SAVINGS_DIR', '/tmp/exo-savings-fixture', () => {
    assert.equal(savingsDirectory(), '/tmp/exo-savings-fixture');
  });
  withEnv('EXO_SAVINGS_DIR', undefined, () => {
    withEnv('CLAUDE_CONFIG_DIR', '/tmp/exo-config-fixture', () => {
      assert.equal(savingsDirectory(), path.join('/tmp/exo-config-fixture', 'exo', 'savings'));
    });
  });
});

test('hotSessionFile joins the savings directory, sessions, and the id as a file name', () => {
  withEnv('EXO_SAVINGS_DIR', '/tmp/exo-savings-fixture', () => {
    assert.equal(hotSessionFile('warned-session'), path.join('/tmp/exo-savings-fixture', 'sessions', 'warned-session.json'));
  });
});

test('hotSessionFile throws on a session id shaped like a path escape', () => {
  assert.throws(() => hotSessionFile('../x'), /invalid session id/);
});
