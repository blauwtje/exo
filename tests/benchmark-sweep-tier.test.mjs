import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { QUICK_CELLS, parseArguments } from '../benchmarks/sweep.mjs';

const SWEEP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'sweep.mjs');

test('no arguments select the quick tier with the four review cells', () => {
  const options = parseArguments([]);
  assert.equal(options.tier, 'quick');
  assert.deepEqual(options.sets, ['review']);
  assert.deepEqual(options.cells, QUICK_CELLS);
  assert.equal(QUICK_CELLS.length, 4);
});

test('--full selects every set', () => {
  const options = parseArguments(['--full']);
  assert.equal(options.tier, 'full');
  assert.deepEqual(options.sets, ['all']);
  assert.equal(options.cells, null);
});

test('an explicit --set leaves the quick tier', () => {
  const options = parseArguments(['--set', 'flow']);
  assert.equal(options.tier, 'custom');
  assert.deepEqual(options.sets, ['flow']);
});

test('--cells without --set is a usage error', () => {
  assert.throws(() => parseArguments(['--cells', 'flow-unit']), /name --set/);
});

test('--dry-run is a flag and defaults to off', () => {
  assert.equal(parseArguments([]).dryRun, false);
  assert.equal(parseArguments(['--dry-run']).dryRun, true);
});

test('--dry-run prints the quick cells and exits 0 without starting any', () => {
  const run = spawnSync(process.execPath, [SWEEP, '--dry-run'], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^quick tier, 4 claude -p calls planned/);
  assert.doesNotMatch(run.stdout, /Re-run with --confirm/);
});

test('without --confirm the quick tier exits 2', () => {
  const run = spawnSync(process.execPath, [SWEEP], { encoding: 'utf8', timeout: 60000 });
  assert.equal(run.status, 2);
});
