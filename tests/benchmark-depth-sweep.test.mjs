import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { resultsText } from '../benchmarks/depth-sweep-results.mjs';
import { depthSweep, parseDepthArguments, roundArguments } from '../benchmarks/depth-sweep.mjs';
import { tempDir } from './harness.mjs';

const costRunner = (costOf, calls) => async ({ arms, index }) => {
  calls.push(`${index}:${arms.join(',')}`);
  return Object.fromEntries(arms.map((arm) => [arm, { costUsd: costOf(`${arm}-${index}`), wallMs: 1000 * index, hiddenPass: true, hopPeakTokens: { main: 10, coordinator: 20, workers: 30 } }]));
};

const stubRunner = (costUsd, calls) => costRunner(() => costUsd, calls);

const PAIR = ['flow-unit', 'flow-other'];
const ALL = PAIR.join(',');

const readRuns = (results) => fs.readFileSync(`${results}.runs.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

test('flags parse and reject a missing repeat, cap or results path', () => {
  const options = parseDepthArguments(['--pilot', '--repeat', '3', '--cap-usd', '25', '--results', 'out.md']);
  assert.deepEqual(options, { pilot: true, repeat: 3, capUsd: 25, results: 'out.md', arms: ['flow-unit'], concurrency: 1 });
  assert.equal(parseDepthArguments(['--repeat', '3', '--cap-usd', '25', '--results', 'out.md', '--concurrency', '2']).concurrency, 2);
  assert.throws(() => parseDepthArguments(['--repeat', '3', '--cap-usd', '25', '--results', 'x', '--concurrency', '0']), /--concurrency/);
  assert.throws(() => parseDepthArguments(['--cap-usd', '25', '--results', 'x']), /--repeat/);
  assert.throws(() => parseDepthArguments(['--repeat', '2', '--results', 'x']), /--cap-usd/);
  assert.throws(() => parseDepthArguments(['--repeat', '2', '--cap-usd', '5']), /--results/);
  assert.throws(() => parseDepthArguments(['--bogus']), /unknown flag/);
});

test('--arms narrows the sweep and refuses a name outside the arms', () => {
  const base = ['--repeat', '13', '--cap-usd', '25', '--results', 'out.md'];
  const options = parseDepthArguments([...base, '--arms', 'flow-unit']);
  assert.deepEqual(options.arms, ['flow-unit']);
  assert.equal(options.concurrency, 1);
  assert.throws(() => parseDepthArguments([...base, '--arms', 'flow-unit,flow-bogus']), /unknown arm flow-bogus/);
});

test('a single-arm sweep runs, projects and reports only that arm', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const calls = [];
  const options = { pilot: true, repeat: 2, capUsd: 25, results, arms: ['flow-unit'] };
  await depthSweep({ options, runRound: stubRunner(1, calls) });
  assert.deepEqual(calls, ['1:flow-unit', '2:flow-unit']);
  const text = fs.readFileSync(results, 'utf8');
  assert.match(text, /flow-unit: n=2/);
  assert.doesNotMatch(text, /minus|## Paired/);
});

test('--pilot runs for the one default arm and refuses a projection over the cap', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const calls = [];
  const options = { pilot: true, repeat: 13, capUsd: 5, results, arms: ['flow-unit'] };
  const outcome = await depthSweep({ options, runRound: stubRunner(1, calls) });
  assert.equal(outcome.refused, true);
  assert.deepEqual(calls, ['1:flow-unit']);
});

test('no Paired heading prints without an arm pair', () => {
  const records = [{ arm: 'flow-unit', index: 1, costUsd: 1, wallMs: 1000, hiddenPass: true }];
  assert.doesNotMatch(resultsText({ records, stopReason: null, arms: ['flow-unit'] }), /## Paired/);
});

test('a round is one sweep call with its arms, the concurrency and a round folder', () => {
  const args = roundArguments({ arms: ['flow-unit', 'flow-other'], index: 4, concurrency: 3, runsDirectory: path.join('runs', 'x') });
  const out = path.join('runs', 'x', 'round-4');
  assert.deepEqual(args, ['benchmarks/sweep.mjs', '--set', 'flow', '--cells', 'flow-unit,flow-other', '--concurrency', '3', '--confirm', '--out', out, '--results', path.join(out, 'published')]);
});

test('a pilot projected over the cap refuses before any full run', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const calls = [];
  const options = { pilot: true, repeat: 13, capUsd: 25, results, arms: PAIR };
  const outcome = await depthSweep({ options, runRound: stubRunner(1, calls) });
  assert.equal(outcome.refused, true);
  assert.deepEqual(calls, [`1:${ALL}`]);
  assert.ok(!fs.existsSync(results));
});

test('each round is one call with only its missing arms and a rerun resumes from the records', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const options = { pilot: true, repeat: 3, capUsd: 25, results, arms: PAIR };
  const first = [];
  await depthSweep({ options, runRound: stubRunner(1, first) });
  assert.deepEqual(first, [`1:${ALL}`, `2:${ALL}`, `3:${ALL}`]);
  assert.equal(readRuns(results).length, 6);
  const text = fs.readFileSync(results, 'utf8');
  assert.match(text, /flow-unit: n=3, median wall 2 s, median cost \$1.000, pass 3\/3/);
  assert.match(text, /flow-other minus flow-unit, costUsd/);
  const second = [];
  await depthSweep({ options, runRound: stubRunner(1, second) });
  assert.deepEqual(second, []);
});

test('a restart asks only for the arms that runs.jsonl lacks', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const kept = [{ arm: 'flow-unit', index: 1 }, { arm: 'flow-other', index: 1 }, { arm: 'flow-other', index: 2 }];
  fs.writeFileSync(`${results}.runs.jsonl`, kept.map((run) => `${JSON.stringify({ ...run, costUsd: 1, wallMs: 1000, hiddenPass: true })}\n`).join(''));
  const calls = [];
  await depthSweep({ options: { pilot: false, repeat: 3, capUsd: 25, results, arms: PAIR }, runRound: stubRunner(1, calls) });
  assert.deepEqual(calls, ['2:flow-unit', `3:${ALL}`]);
  const names = readRuns(results).map((run) => `${run.arm}-${run.index}`);
  assert.equal(names.length, 6);
  assert.equal(new Set(names).size, 6);
});

test('the cap stops between rounds, counting every invocation', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const options = { pilot: false, repeat: 5, capUsd: 4, results, arms: PAIR };
  const first = [];
  await depthSweep({ options, runRound: stubRunner(1, first) });
  assert.deepEqual(first, [`1:${ALL}`, `2:${ALL}`]);
  const second = [];
  await depthSweep({ options, runRound: stubRunner(1, second) });
  assert.deepEqual(second, []);
  assert.match(fs.readFileSync(results, 'utf8'), /Stopped at the cost cap/);
});

test('a round that leaves an arm without a record keeps the others and fails by name', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const options = { pilot: false, repeat: 2, capUsd: 25, results, arms: PAIR };
  const runRound = async ({ arms }) => Object.fromEntries(arms.map((arm) => [arm, arm === 'flow-other' ? null : { costUsd: 1, wallMs: 1000, hiddenPass: true }]));
  await assert.rejects(depthSweep({ options, runRound }), /flow-other run 1 left no record/);
  assert.deepEqual(readRuns(results).map((run) => run.arm), ['flow-unit']);
});

for (const [label, missing] of [['null', null], ['undefined', undefined]]) {
  test(`a run with costUsd ${label} stops the sweep after its round and names that run`, async () => {
    const results = path.join(tempDir('depth-sweep-'), 'result.md');
    const options = { pilot: false, repeat: 5, capUsd: 25, results, arms: PAIR };
    const calls = [];
    const outcome = await depthSweep({ options, runRound: costRunner((name) => (name === 'flow-other-1' ? missing : 1), calls) });
    assert.deepEqual(calls, [`1:${ALL}`]);
    assert.match(outcome.stopReason, /flow-other-1 has no finite costUsd/);
    assert.match(fs.readFileSync(results, 'utf8'), /flow-other-1 has no finite costUsd/);
  });

  test(`a pilot with costUsd ${label} refuses the sweep and names that run`, async () => {
    const results = path.join(tempDir('depth-sweep-'), 'result.md');
    const options = { pilot: true, repeat: 2, capUsd: 25, results, arms: PAIR };
    const calls = [];
    const outcome = await depthSweep({ options, runRound: costRunner((name) => (name === 'flow-other-1' ? missing : 1), calls) });
    assert.equal(outcome.refused, true);
    assert.match(outcome.reason, /pilot run flow-other-1 has no finite costUsd/);
    assert.deepEqual(calls, [`1:${ALL}`]);
    assert.ok(!fs.existsSync(results));
  });
}
