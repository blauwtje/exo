import assert from 'node:assert/strict';
import test from 'node:test';
import { parseArguments } from '../benchmarks/run-args.mjs';
import { DEFAULT_ARMS, SMOKE_TASKS, VALUE_QUICK_TASKS } from '../benchmarks/tasks.mjs';

test('parseArguments reads a custom run', () => {
  const options = parseArguments(['--tasks', 'a,b', '--arms', 'baseline', '--runs', '3', '--model', 'sonnet', '--concurrency', '1', '--dry-run']);
  assert.equal(options.mode, 'custom');
  assert.deepEqual(options.tasks, ['a', 'b']);
  assert.deepEqual(options.arms, ['baseline']);
  assert.equal(options.runs, 3);
  assert.equal(options.model, 'sonnet');
  assert.equal(options.concurrency, 1);
  assert.equal(options.dryRun, true);
});

test('parseArguments defaults a smoke run to the smoke tasks and every default arm', () => {
  const options = parseArguments(['--smoke']);
  assert.equal(options.mode, 'smoke');
  assert.deepEqual(options.tasks, SMOKE_TASKS);
  assert.deepEqual(options.arms, DEFAULT_ARMS);
  assert.equal(options.model, 'haiku');
});

test('parseArguments gives a full run four runs unless --runs names one', () => {
  assert.equal(parseArguments(['--full']).runs, 4);
  assert.equal(parseArguments(['--full', '--runs', '2']).runs, 2);
});

test('parseArguments takes a tier as the task list', () => {
  const options = parseArguments(['--tier', 'safe']);
  assert.equal(options.tier, 'safe');
  assert.ok(options.tasks.length > 0);
});

test('parseArguments refuses unknown flags, models and tiers, and a missing task source', () => {
  assert.throws(() => parseArguments(['--bogus']), /unknown flag --bogus/);
  assert.throws(() => parseArguments(['--smoke', '--model', 'nope']), /unknown model nope/);
  assert.throws(() => parseArguments(['--tier', 'nope']), /unknown tier nope/);
  assert.throws(() => parseArguments([]), /name --tasks or --tier/);
});

test('--tier value alone is the quick tier: three tasks, exo arm, one run, sonnet, one cell at a time, $1.00 cap', () => {
  const options = parseArguments(['--tier', 'value']);
  assert.equal(options.mode, 'quick');
  assert.deepEqual(options.tasks, VALUE_QUICK_TASKS);
  assert.deepEqual(options.arms, ['exo']);
  assert.equal(options.runs, 1);
  assert.equal(options.model, 'sonnet');
  assert.equal(options.concurrency, 1);
  assert.equal(options.maxTotalUsd, 1);
});

test('quick keeps a named cap and forces one cell at a time', () => {
  const options = parseArguments(['--tier', 'value', '--max-total-usd', '0.5', '--concurrency', '3']);
  assert.equal(options.maxTotalUsd, 0.5);
  assert.equal(options.concurrency, 1);
});

test('--tier value --full keeps all value tasks, four runs and no cap', () => {
  const options = parseArguments(['--tier', 'value', '--full']);
  assert.equal(options.mode, 'full');
  assert.ok(options.tasks.length > VALUE_QUICK_TASKS.length);
  assert.equal(options.runs, 4);
  assert.equal(options.maxTotalUsd, null);
});

test('naming --tasks with --tier value is not quick', () => {
  const options = parseArguments(['--tier', 'value', '--tasks', 'value-test-pollution']);
  assert.equal(options.mode, 'custom');
  assert.equal(options.maxTotalUsd, null);
});
