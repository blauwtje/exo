// #session-record-path owns the session id shape that becomes a file name.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSessionId } from '../lib/session-record-path.mjs';

test('isSessionId accepts word characters and hyphens only', () => {
  assert.equal(isSessionId('notified-session'), true);
  assert.equal(isSessionId('abc_123'), true);
  assert.equal(isSessionId('../x'), false);
  assert.equal(isSessionId('with space'), false);
});
