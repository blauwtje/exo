import assert from 'node:assert/strict';
import { test } from 'node:test';
import { roundCap } from '../lib/loop-budget.mjs';
import { RUN_OUTCOMES, outcomeLine } from '../lib/run-outcomes.mjs';

const ACTIONS = ['continue', 'repair', 'park', 'stop'];

test('every row has its own kind, one known action and a single Then: line', () => {
  for (const [kind, row] of Object.entries(RUN_OUTCOMES)) {
    assert.equal(row.kind, kind);
    assert.ok(ACTIONS.includes(row.action), kind);
    assert.match(row.line, /^Then: \S/, kind);
    assert.ok(!row.line.includes('\n'), kind);
  }
});

test('the table is frozen and an unknown kind throws', () => {
  assert.ok(Object.isFrozen(RUN_OUTCOMES));
  assert.ok(Object.isFrozen(RUN_OUTCOMES.lock));
  assert.throws(() => outcomeLine('mystery'), /no run outcome for 'mystery'/);
});

test('a gate fail repairs, a question parks and only the bound stops', () => {
  assert.equal(RUN_OUTCOMES['gate fail'].action, 'repair');
  assert.equal(RUN_OUTCOMES['question'].action, 'park');
  assert.equal(RUN_OUTCOMES['repair bound'].action, 'stop');
});

test('the repair line reads its cap from the fix kind', () => {
  const repairs = roundCap('fix') - 1;
  assert.match(outcomeLine('proof failed'), new RegExp(`at most ${repairs} times`));
  assert.match(outcomeLine('findings'), new RegExp(`at most ${repairs} times`));
});

test('a recurring finding stops and an unread file repairs by a re-read', () => {
  assert.equal(RUN_OUTCOMES['recurring finding'].action, 'stop');
  assert.equal(RUN_OUTCOMES['unread file'].action, 'repair');
});

test('a discarded fix continues and the spent review budget stops', () => {
  assert.equal(RUN_OUTCOMES['fix discarded'].action, 'continue');
  assert.equal(RUN_OUTCOMES['review budget'].action, 'stop');
});
