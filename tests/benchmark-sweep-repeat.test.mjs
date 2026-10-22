import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { repeatCells } from '../benchmarks/sweep.mjs';
import { sweepCells } from '../benchmarks/sweep-cells.mjs';

const SWEEP = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'benchmarks', 'sweep.mjs');

function dryRun(...args) {
  return spawnSync(process.execPath, [SWEEP, ...args], { encoding: 'utf8', timeout: 60000 });
}

test('--repeat 2 plans two calls for a non-replay cell, with the base id and distinct result dirs', () => {
  const run = dryRun('--set', 'flow', '--cells', 'flow-unit', '--repeat', '2');
  assert.match(run.stdout, /^2 claude -p calls planned/);
  assert.match(run.stdout, /^ {2}flow-unit-1:/m);
  assert.match(run.stdout, /^ {2}flow-unit-2:/m);
  assert.match(run.stdout, /one per cell and repeat/);
});

test('without --repeat a cell keeps its id and one call', () => {
  const run = dryRun('--set', 'flow', '--cells', 'flow-unit');
  assert.match(run.stdout, /^1 claude -p calls planned/);
  assert.match(run.stdout, /^ {2}flow-unit:/m);
});

test('--repeat that is not a positive integer is refused', () => {
  for (const value of ['0', 'x', '1.5', '-1']) {
    const run = dryRun('--set', 'flow', '--cells', 'flow-unit', '--repeat', value);
    assert.notEqual(run.status, 0, value);
    assert.match(run.stderr, /--repeat must be a positive integer/, value);
    assert.doesNotMatch(run.stdout, /calls planned/, value);
  }
});

test('copies keep the base id, so they stay one arm, and differ in directory and repeat', () => {
  const unit = sweepCells().filter((cell) => cell.id === 'flow-unit');
  const copies = repeatCells(unit, 2);
  assert.deepEqual(copies.map((cell) => cell.id), ['flow-unit', 'flow-unit']);
  assert.deepEqual(copies.map((cell) => cell.directory), ['flow-unit-1', 'flow-unit-2']);
  assert.deepEqual(copies.map((cell) => cell.repeat), [1, 2]);
  assert.equal(repeatCells(unit, 1), unit);
});

test('replay cells are not expanded again', () => {
  const replay = [{ id: 'replay-x-opus-1', kind: 'replay' }];
  assert.deepEqual(repeatCells(replay, 3), replay);
});

test('--reviewer-bodies lists one judge cell per body and rejects a bad pair', () => {
  const run = dryRun('--set', 'review', '--reviewer-bodies', 'plan-fit=/dev/null,standard=/dev/null,tests=/dev/null');
  assert.match(run.stdout, /-judge-plan-fit: /);
  assert.match(run.stdout, /-judge-standard: /);
  assert.match(run.stdout, /-judge-tests: /);
  const bad = dryRun('--set', 'review', '--reviewer-bodies', 'a');
  assert.notEqual(bad.status, 0);
  assert.match(bad.stderr, /name=file/);
  const wrong = dryRun('--set', 'review', '--reviewer-bodies', 'a=/dev/null,b=/dev/null');
  assert.notEqual(wrong.status, 0);
  assert.match(wrong.stderr, /plan-fit, standard, tests/);
});
