import test from 'node:test';
import assert from 'node:assert/strict';
import { armComparison, comparisonLine, routingStats, statsLines, wilson } from '../benchmarks/routing-stats.mjs';

const session = (prompt, expect, run, pick, extra = {}) => ({ cell: 'sonnet:low', arm: 'hook', split: 'held-out', prompt, expect, run, pick, ...extra });

test('wilson matches the textbook interval and is null without trials', () => {
  const [low, high] = wilson(8, 10);
  assert.ok(Math.abs(low - 0.4902) < 1e-3 && Math.abs(high - 0.9433) < 1e-3, `${low} ${high}`);
  assert.equal(wilson(0, 5)[0], 0);
  assert.equal(wilson(0, 0), null);
});

test('routingStats pools recall, spans runs, counts an errored session as a miss and reads a null prompt that picks any skill as a false positive', () => {
  const sessions = [
    session('a', 'start', 1, 'start'), session('b', 'start', 1, null),
    session('a', 'start', 2, 'start'), session('b', 'start', 2, 'start'),
    session('n', null, 1, 'build'), session('n', null, 2, null),
    session('a', 'start', 3, null, { error: 'timeout' }),
    session('a', 'start', 1, null, { arm: 'no-hook' }),
    session('c', 'start', 1, null, { split: 'train' })
  ];
  const table = routingStats(sessions, { split: 'held-out' });
  assert.deepEqual(Object.keys(table), ['null', 'start']);
  assert.deepEqual([table.start.measure, table.start.rate, table.start.min, table.start.max, table.start.prompts, table.start.trials], ['recall', 0.6, 0, 1, 2, 5]);
  assert.equal(table.start.errored, 1);
  assert.deepEqual(table.start.ci95, wilson(3, 5));
  assert.equal(table.start.cluster.clusters, 2);
  assert.deepEqual([table.null.measure, table.null.rate, table.null.perRun], ['falsePositive', 0.5, [1, 0]]);
  assert.match(statsLines(table)[1], /^start\s+recall\s+0\.600 runs 0\.000-1\.000 ci95 .* se 0\.\d+ prompts 2 trials 5 errored 1$/);
});

test('armComparison pairs hook against no-hook per prompt and counts an errored session as a fail', () => {
  const sessions = [];
  for (const prompt of ['a', 'b', 'c', 'd']) {
    sessions.push(session(prompt, 'start', 1, 'start'), session(prompt, 'start', 1, null, { arm: 'no-hook' }));
  }
  sessions.push(session('e', 'start', 1, 'start'), session('e', 'start', 1, null, { arm: 'no-hook', error: 'timeout' }));
  const comparison = armComparison(sessions);
  assert.deepEqual([comparison.diff.n, comparison.diff.mean], [5, 1]);
  assert.match(comparisonLine(comparison), /^hook minus no-hook, paired per prompt: 1\.000 se 0\.000/);
  assert.equal(armComparison([session('a', 'start', 1, 'start')]), null);
});
