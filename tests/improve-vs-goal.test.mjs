import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armSummary, compareArms, quality, streamCost, summaryLines } from '../benchmarks/improve-vs-goal.mjs';

const MERGE_SORT = `export function sort(items, compare) {
  if (items.length < 2) return items.slice();
  const middle = items.length >> 1;
  const left = sort(items.slice(0, middle), compare);
  const right = sort(items.slice(middle), compare);
  const output = [];
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) output.push(compare(left[i], right[j]) <= 0 ? left[i++] : right[j++]);
  return output.concat(left.slice(i), right.slice(j));
}
`;

test('a correct sort scores its comparison count on both case sets', () => {
  const result = quality({ sortText: MERGE_SORT, scoreText: '' });
  assert.equal(result.correct, true);
  assert.ok(result.score > 20000 && result.score < 30000);
  assert.equal(result.scorerUnchanged, false);
});

test('a sort that skips the compare function scores as wrong', () => {
  const result = quality({ sortText: 'export function sort(items) { return items.slice().sort(); }\n', scoreText: '' });
  assert.equal(result.correct, false);
  assert.equal(result.score, 999999999);
});

test('stream cost prefers the result total and falls back to unique message usage', () => {
  const assistant = JSON.stringify({ type: 'assistant', message: { id: 'm1', model: 'claude-sonnet-4-5', usage: { input_tokens: 1000000, output_tokens: 0 } } });
  assert.equal(streamCost([assistant, JSON.stringify({ type: 'result', total_cost_usd: 0.5 })]).costUsd, 0.5);
  const fallback = streamCost([assistant, assistant]);
  assert.equal(fallback.costSource, 'usage sum');
  assert.ok(fallback.costUsd > 0);
});

const run = (options) => ({ arm: 'improve', correct: true, scorerUnchanged: true, killed: false, subtype: 'success', costUsd: 1, wallS: 100, score: 1000, heldOut: 500, ...options });

test('stream cost is unknown, not zero, when a message cannot be priced or no usage was seen', () => {
  const unpriced = JSON.stringify({ type: 'assistant', message: { id: 'm1', model: 'no-such-model', usage: { input_tokens: 10, output_tokens: 1 } } });
  assert.equal(streamCost([unpriced]).costUsd, null);
  assert.equal(streamCost([]).costUsd, null);
});

test('an aborted or wrong run counts as a failure and stays out of the cost and wall means', () => {
  const summary = armSummary([run({}), run({ costUsd: 3, wallS: 300 }), run({ killed: true, wallS: 1200, costUsd: 9 }), run({ correct: false, score: 999999999 }), run({ costUsd: null, subtype: 'error_during_execution' })]);
  assert.equal(summary.passed, 2);
  assert.equal(summary.aborted, 2);
  assert.deepEqual([summary.costUsd.mean, summary.costUsd.n, summary.costUsd.excluded], [1.6666666666666667, 3, 2]);
  assert.deepEqual([summary.wallS.n, summary.wallS.excluded], [3, 2]);
  assert.deepEqual([summary.score.n, summary.score.excluded, summary.score.mean], [4, 1, 1000]);
});

test('one run per arm prints no SE and gives no verdict', () => {
  const lines = summaryLines({ improve: armSummary([run({})]), goal: armSummary([run({ arm: 'goal', score: 10 })]) });
  assert.ok(lines.some((line) => line.startsWith('improve minus goal score:') && line.endsWith('-> no SE')));
  assert.match(lines[0], /comparisons 1000\.0 no SE n 1 excluded 0/);
});

test('arms whose spread leaves the difference clear get a verdict by the 2-SE rule', () => {
  const improve = armSummary([run({ score: 100 }), run({ score: 102 }), run({ score: 98 })]);
  const goal = armSummary([run({ arm: 'goal', score: 300 }), run({ arm: 'goal', score: 305 }), run({ arm: 'goal', score: 295 })]);
  assert.equal(compareArms(improve, goal).score.verdict, 'improve lower');
  const noisy = armSummary([run({ score: 100 }), run({ score: 400 }), run({ score: 250 })]);
  assert.equal(compareArms(noisy, goal).score.verdict, 'no clear difference');
});
