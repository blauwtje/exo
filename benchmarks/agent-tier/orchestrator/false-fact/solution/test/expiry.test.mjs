import assert from 'node:assert/strict';
import test from 'node:test';
import { expiresAt } from '../src/expiry.mjs';

test('expiresAt adds the lifetime in milliseconds to the issue time', () => {
  assert.equal(expiresAt({ issuedAt: 0 }), 3_600_000);
  assert.equal(expiresAt({ issuedAt: 1000 }), 3_601_000);
});
