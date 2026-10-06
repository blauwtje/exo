import assert from 'node:assert/strict';
import test from 'node:test';
import { PlanRecord, UserRecord } from '../src/models/index.js';

test('UserRecord trims and lower-cases the email', () => {
  const member = new UserRecord({ id: 1, email: '  Ann@Example.COM ', name: 'Ann' });
  assert.equal(member.email, 'ann@example.com');
  assert.equal(member.plan, 'free');
});

test('UserRecord rejects an address without an @', () => {
  assert.throws(() => new UserRecord({ id: 1, email: 'nope', name: 'Ann' }), /invalid user email: nope/);
});

test('UserRecord needs a name', () => {
  assert.throws(() => new UserRecord({ id: 1, email: 'a@b.co', name: '  ' }), /name is required/);
});

test('UserRecord serialises with its kind', () => {
  const member = UserRecord.fromRow({ id: 7, email: 'a@b.co', name: 'Al', plan: 'pro' });
  assert.deepEqual(JSON.parse(JSON.stringify(member)), {
    kind: 'user', id: 7, email: 'a@b.co', name: 'Al', plan: 'pro',
  });
  assert.equal(member.displayName, 'Al <a@b.co>');
});

test('PlanRecord formats its price', () => {
  assert.equal(new PlanRecord({ code: 'pro', priceCents: 900 }).price, '$9.00');
});
