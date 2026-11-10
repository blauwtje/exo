import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { depthSweep, parseDepthArguments, roundArguments } from '../benchmarks/depth-sweep.mjs';
import { tempDir } from './harness.mjs';

const costRunner = (costOf, calls) => async ({ arms, index }) => {
  calls.push(`${index}:${arms.join(',')}`);
  return Object.fromEntries(arms.map((arm) => [arm, { costUsd: costOf(`${arm}-${index}`), wallMs: 1000 * index, hiddenPass: true, hopPeakTokens: { main: 10, coordinator: 20, workers: 30 } }]));
};

const stubRunner = (costUsd, calls) => costRunner(() => costUsd, calls);

const ALL = 'flow-unit,flow-direct,flow-nofork';

const readRuns = (results) => fs.readFileSync(`${results}.runs.jsonl`, 'utf8').trim().split('\n').map((line) => JSON.parse(line));

test('flags parse and reject a missing repeat, cap or results path', () => {
  const options = parseDepthArguments(['--pilot', '--repeat', '3', '--cap-usd', '25', '--results', 'out.md']);
  assert.deepEqual(options, { pilot: true, repeat: 3, capUsd: 25, results: 'out.md', concurrency: 3 });
  assert.equal(parseDepthArguments(['--repeat', '3', '--cap-usd', '25', '--results', 'out.md', '--concurrency', '2']).concurrency, 2);
  assert.throws(() => parseDepthArguments(['--repeat', '3', '--cap-usd', '25', '--results', 'x', '--concurrency', '0']), /--concurrency/);
  assert.throws(() => parseDepthArguments(['--cap-usd', '25', '--results', 'x']), /--repeat/);
  assert.throws(() => parseDepthArguments(['--repeat', '2', '--results', 'x']), /--cap-usd/);
  assert.throws(() => parseDepthArguments(['--repeat', '2', '--cap-usd', '5']), /--results/);
  assert.throws(() => parseDepthArguments(['--bogus']), /unknown flag/);
});

test('a round is one sweep call with its arms, the concurrency and a round folder', () => {
  const args = roundArguments({ arms: ['flow-unit', 'flow-nofork'], index: 4, concurrency: 3, runsDirectory: path.join('runs', 'x') });
  const out = path.join('runs', 'x', 'round-4');
  assert.deepEqual(args, ['benchmarks/sweep.mjs', '--set', 'flow', '--cells', 'flow-unit,flow-nofork', '--concurrency', '3', '--confirm', '--out', out, '--results', path.join(out, 'published')]);
});

test('a pilot projected over the cap refuses before any full run', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const calls = [];
  const options = { pilot: true, repeat: 13, capUsd: 25, results };
  const outcome = await depthSweep({ options, runRound: stubRunner(1, calls) });
  assert.equal(outcome.refused, true);
  assert.deepEqual(calls, ['1:flow-direct,flow-nofork']);
  assert.ok(!fs.existsSync(results));
});

test('each round is one call with only its missing arms and a rerun resumes from the records', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const options = { pilot: true, repeat: 3, capUsd: 25, results };
  const first = [];
  await depthSweep({ options, runRound: stubRunner(1, first) });
  assert.deepEqual(first, ['1:flow-direct,flow-nofork', '1:flow-unit', `2:${ALL}`, `3:${ALL}`]);
  assert.equal(readRuns(results).length, 9);
  const text = fs.readFileSync(results, 'utf8');
  assert.match(text, /flow-unit: n=3, median wall 2 s, median cost \$1.000, pass 3\/3/);
  assert.match(text, /flow-direct minus flow-unit, costUsd/);
  const second = [];
  await depthSweep({ options, runRound: stubRunner(1, second) });
  assert.deepEqual(second, []);
});

test('a restart asks only for the arms that runs.jsonl lacks', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const kept = [{ arm: 'flow-unit', index: 1 }, { arm: 'flow-direct', index: 1 }, { arm: 'flow-nofork', index: 1 }, { arm: 'flow-direct', index: 2 }];
  fs.writeFileSync(`${results}.runs.jsonl`, kept.map((run) => `${JSON.stringify({ ...run, costUsd: 1, wallMs: 1000, hiddenPass: true })}\n`).join(''));
  const calls = [];
  await depthSweep({ options: { pilot: false, repeat: 3, capUsd: 25, results }, runRound: stubRunner(1, calls) });
  assert.deepEqual(calls, ['2:flow-unit,flow-nofork', `3:${ALL}`]);
  const names = readRuns(results).map((run) => `${run.arm}-${run.index}`);
  assert.equal(names.length, 9);
  assert.equal(new Set(names).size, 9);
});

test('the cap stops between rounds, counting every invocation', async () => {
  const results = path.join(tempDir('depth-sweep-'), 'result.md');
  const options = { pilot: false, repeat: 5, capUsd: 4, results };
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
  const options = { pilot: false, repeat: 2, capUsd: 25, results };
  const runRound = async ({ arms }) => Object.fromEntries(arms.map((arm) => [arm, arm === 'flow-direct' ? null : { costUsd: 1, wallMs: 1000, hiddenPass: true }]));
  await assert.rejects(depthSweep({ options, runRound }), /flow-direct run 1 left no record/);
  assert.deepEqual(readRuns(results).map((run) => run.arm), ['flow-unit', 'flow-nofork']);
});

for (const [label, missing] of [['null', null], ['undefined', undefined]]) {
  test(`a run with costUsd ${label} stops the sweep after its round and names that run`, async () => {
    const results = path.join(tempDir('depth-sweep-'), 'result.md');
    const options = { pilot: false, repeat: 5, capUsd: 25, results };
    const calls = [];
    const outcome = await depthSweep({ options, runRound: costRunner((name) => (name === 'flow-direct-1' ? missing : 1), calls) });
    assert.deepEqual(calls, [`1:${ALL}`]);
    assert.match(outcome.stopReason, /flow-direct-1 has no finite costUsd/);
    assert.match(fs.readFileSync(results, 'utf8'), /flow-direct-1 has no finite costUsd/);
  });

  test(`a pilot with costUsd ${label} refuses the sweep and names that run`, async () => {
    const results = path.join(tempDir('depth-sweep-'), 'result.md');
    const options = { pilot: true, repeat: 2, capUsd: 25, results };
    const calls = [];
    const outcome = await depthSweep({ options, runRound: costRunner((name) => (name === 'flow-nofork-1' ? missing : 1), calls) });
    assert.equal(outcome.refused, true);
    assert.match(outcome.reason, /pilot run flow-nofork-1 has no finite costUsd/);
    assert.deepEqual(calls, ['1:flow-direct,flow-nofork']);
    assert.ok(!fs.existsSync(results));
  });
}
