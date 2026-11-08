import test from 'node:test';
import assert from 'node:assert/strict';
import { frontierVerdict, replayFlips, PROMOTE, HOLD, WORSE } from '../benchmarks/frontier-verdict.mjs';

const cell = (...pairs) => pairs.map(([cost, wall]) => ({ cost, wall }));

test('promotes when both endpoints are no worse and one is better', () => {
  const base = cell([0.4, 100], [0.5, 90]);
  const candidate = cell([0.3, 100], [0.5, 90]);
  assert.equal(frontierVerdict({ base, candidate }), PROMOTE);
});

test('worse when either endpoint regresses', () => {
  const base = cell([0.4, 100]);
  assert.equal(frontierVerdict({ base, candidate: cell([0.3, 120]) }), WORSE);
  assert.equal(frontierVerdict({ base, candidate: cell([0.5, 80]) }), WORSE);
});

test('holds on equal endpoints', () => {
  const base = cell([0.4, 100]);
  assert.equal(frontierVerdict({ base, candidate: cell([0.4, 100], [0.9, 200]) }), HOLD);
});

test('rejects an empty cell', () => {
  assert.throws(() => frontierVerdict({ base: [], candidate: cell([1, 1]) }), RangeError);
});

test('replay counts promote verdicts that flip', () => {
  const kept = { id: 'a', verdict: PROMOTE, base: cell([0.4, 100]), candidate: cell([0.3, 90]) };
  const flipped = { id: 'b', verdict: PROMOTE, base: cell([0.4, 100]), candidate: cell([0.3, 130]) };
  const other = { id: 'c', verdict: HOLD, base: cell([0.4, 100]), candidate: cell([0.5, 100]) };
  assert.deepEqual(replayFlips([kept, flipped, other]), { total: 3, flipped: 1, ids: ['b'] });
});
