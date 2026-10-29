import test from 'node:test';
import assert from 'node:assert/strict';
import { routingStats, statsLines, wilson } from '../benchmarks/routing-stats.mjs';

const session = (prompt, expect, run, pick, extra = {}) => ({ cell: 'sonnet:low', arm: 'hook', split: 'held-out', prompt, expect, run, pick, ...extra });

test('wilson matches the textbook interval and is null without trials', () => {
  const [low, high] = wilson(8, 10);
  assert.ok(Math.abs(low - 0.4902) < 1e-3 && Math.abs(high - 0.9433) < 1e-3, `${low} ${high}`);
  assert.equal(wilson(0, 5)[0], 0);
  assert.equal(wilson(0, 0), null);
});

test('routingStats pools recall, spans runs, and reads a null prompt that picks any skill as a false positive', () => {
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
  assert.deepEqual([table.start.measure, table.start.rate, table.start.min, table.start.max, table.start.prompts, table.start.trials], ['recall', 0.75, 0.5, 1, 2, 4]);
  assert.deepEqual(table.start.ci95, wilson(3, 4));
  assert.deepEqual([table.null.measure, table.null.rate, table.null.perRun], ['falsePositive', 0.5, [1, 0]]);
  assert.match(statsLines(table)[1], /^start\s+recall\s+0\.750 runs 0\.500-1\.000 ci95 /);
});
