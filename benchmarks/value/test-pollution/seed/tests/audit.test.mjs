import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventsFor, record } from '../src/audit/trail.mjs';

test('an event without a tenant is refused', () => {
  assert.throws(() => record({ type: 'x', ref: '1' }), /needs a tenant/);
});

test('events are listed per tenant', () => {
  record({ tenant: 'audit-a', type: 'a', ref: '1' });
  record({ tenant: 'audit-b', type: 'b', ref: '2' });
  assert.deepEqual(eventsFor('audit-a').map((event) => event.type), ['a']);
});

test('sequence numbers grow', () => {
  const first = record({ tenant: 'audit-a', type: 'c', ref: '3' });
  const second = record({ tenant: 'audit-a', type: 'd', ref: '4' });
  assert.equal(second.seq, first.seq + 1);
});
