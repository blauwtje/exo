import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quality, streamCost } from '../benchmarks/improve-vs-goal.mjs';

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
