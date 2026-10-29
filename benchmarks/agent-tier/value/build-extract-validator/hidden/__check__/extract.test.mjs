import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { invite } from '../src/invite.mjs';
import { normalizeEmail } from '../src/normalize-email.mjs';
import { signup } from '../src/signup.mjs';

const srcDir = path.resolve(import.meta.dirname, '..', 'src');
const PATTERN_MARK = '[^@\\s]+@';

test('normalizeEmail trims and lowercases', () => {
  assert.equal(normalizeEmail('  Ann@Example.COM '), 'ann@example.com');
});

test('normalizeEmail rejects with the raw value in the message', () => {
  assert.throws(() => normalizeEmail(' Not An Email '), /invalid email:  Not An Email $/);
  assert.throws(() => normalizeEmail('a@b'), /invalid email: a@b/);
  assert.throws(() => normalizeEmail('a b@c.de'), /invalid email/);
});

test('signup keeps its behavior', () => {
  const users = [];
  assert.deepEqual(signup(users, ' Cy@Mail.io'), { email: 'cy@mail.io' });
  assert.throws(() => signup(users, 'CY@mail.io'), /duplicate email: cy@mail.io/);
  assert.throws(() => signup(users, 'bad'), /invalid email: bad/);
  assert.equal(users.length, 1);
});

test('invite keeps its behavior', () => {
  assert.deepEqual(invite({ email: 'in@v.it' }, 'Di@Mail.io'), { email: 'di@mail.io', invitedBy: 'in@v.it' });
  assert.throws(() => invite({ email: 'in@v.it' }, 'bad'), /invalid email: bad/);
});

test('the email pattern lives in exactly one source file', () => {
  const holders = readdirSync(srcDir).filter((name) => readFileSync(path.join(srcDir, name), 'utf8').includes(PATTERN_MARK));
  assert.deepEqual(holders, ['normalize-email.mjs']);
});

test('signup and invite both use the shared module', () => {
  for (const name of ['signup.mjs', 'invite.mjs']) {
    assert.match(readFileSync(path.join(srcDir, name), 'utf8'), /from '\.\/normalize-email\.mjs'/);
  }
});
