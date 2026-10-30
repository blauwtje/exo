import assert from 'node:assert/strict';
import test from 'node:test';
import { isExpired, issue } from '../src/auth.mjs';

test('issue stamps the time it was issued', () => {
  assert.deepEqual(issue('u1', 1000), { userId: 'u1', issuedAt: 1000 });
});

test('isExpired is true one millisecond after the lifetime', () => {
  const token = issue('u1', 0);
  assert.equal(isExpired(token, 3_600_000), false);
  assert.equal(isExpired(token, 3_600_001), true);
});
