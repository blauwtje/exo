import { test } from 'node:test';
import assert from 'node:assert/strict';
import { roundCap } from '../lib/loop-budget.mjs';

const OWNED = [
  ['review', 'gate-repair.mjs'],
  ['review-fix', 'run-tail.mjs', 2],
  ['provider', 'run-session.mjs'],
  ['proof', 'land-proof.mjs']
];

for (const [kind, owner, cap = 3] of OWNED) {
  test(`kind ${kind} of ${owner} takes its cap from the table and an env override`, () => {
    assert.equal(roundCap(kind), cap);
    assert.equal(roundCap(kind, { [`EXO_LOOP_${kind.toUpperCase().replace(/\W+/g, '_')}_CAP`]: '5' }), 5);
  });
}
