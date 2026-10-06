import assert from 'node:assert/strict';
import test from 'node:test';
import { createStore } from '../src/data.js';
import { PlanRecord, Account } from '../src/models/index.js';
import { signup } from '../src/services/signup.js';

function store() {
  return createStore({
    members: [new Account({ id: 4, email: 'a@b.co', name: 'Al' })],
    plans: new Map([['free', new PlanRecord({ code: 'free' })]]),
  });
}

test('signup assigns the next id and stores the member', () => {
  const s = store();
  const member = signup(s, { email: 'C@d.co', name: 'Cy' });
  assert.equal(member.id, 5);
  assert.equal(s.members.length, 2);
});

test('signup refuses a duplicate email', () => {
  assert.throws(() => signup(store(), { email: ' A@B.co', name: 'Al 2' }), /already registered/);
});

test('signup refuses an unknown plan', () => {
  assert.throws(() => signup(store(), { email: 'x@y.co', name: 'X', plan: 'gold' }), /unknown plan: gold/);
});
