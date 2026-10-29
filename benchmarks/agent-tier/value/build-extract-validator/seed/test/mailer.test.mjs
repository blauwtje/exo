import assert from 'node:assert/strict';
import test from 'node:test';
import { invite } from '../src/invite.mjs';
import { signup } from '../src/signup.mjs';

test('signup normalizes and stores the email', () => {
  const users = [];
  assert.deepEqual(signup(users, '  Ann@Example.com '), { email: 'ann@example.com' });
  assert.equal(users.length, 1);
});

test('signup rejects duplicates', () => {
  assert.throws(() => signup([{ email: 'a@b.co' }], 'A@B.co'), /duplicate email: a@b.co/);
});

test('invite rejects a malformed email', () => {
  assert.throws(() => invite({ email: 'x@y.zz' }, 'nope'), /invalid email: nope/);
});

test('invite records the inviter', () => {
  assert.deepEqual(invite({ email: 'x@y.zz' }, 'Bo@Example.org'), { email: 'bo@example.org', invitedBy: 'x@y.zz' });
});
