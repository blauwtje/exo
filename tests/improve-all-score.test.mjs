import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildMeasures, geometricMean, projectedUsd, ratioStats, ratios, replayMeasures, scoreLine, statLine, taskItems, tierFor } from '../benchmarks/improve-all-score.mjs';

test('importing the scorer runs no measurement', () => {
  assert.equal(process.exitCode, undefined);
});

test('geometricMean of equal values is that value', () => {
  assert.ok(Math.abs(geometricMean([2, 2, 2]) - 2) < 1e-9);
});

test('geometricMean of 1 and 4 is 2', () => {
  assert.ok(Math.abs(geometricMean([1, 4]) - 2) < 1e-9);
});

test('ratios divide each measure by its main constant, the verify cost scaled to the tier replay repeat', () => {
  const parts = ratios({ rounds: 1.857, verifyCost: 9.2, buildWall: 294.9487, buildCost: 0.95046258 / 2 }, tierFor({ full: true }));
  assert.deepEqual(parts.map(([id]) => id), ['rounds', 'verify-cost', 'build-wall', 'build-cost']);
  const values = parts.map(([, ratio]) => ratio);
  [1, 2, 1, 0.5].forEach((expected, index) => assert.ok(Math.abs(values[index] - expected) < 1e-9));
});

test('a quick replay at half the full repeat and half the cost scores a verify-cost ratio of 1', () => {
  const parts = ratios({ rounds: 1.857, verifyCost: 2.3, buildWall: 294.9487, buildCost: 0.95046258 }, tierFor({}));
  assert.ok(Math.abs(parts[1][1] - 1) < 1e-9);
});

const writeReplay = (cells) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-all-test-'));
  cells.forEach((run, index) => {
    const folder = path.join(directory, `task-a-${index}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'run.json'), JSON.stringify(run));
  });
  return directory;
};

const goodRun = { costUsd: 2, roundsToClean: 2, grade: { planted: 4, fixed: 4, falseFix: 0 } };
const badRun = { costUsd: 2, roundsToClean: 3, grade: { planted: 4, fixed: 0, falseFix: 1 } };

test('a good replay dir scores its rounds and cost offline', () => {
  const measured = replayMeasures(writeReplay([goodRun, goodRun]));
  assert.equal(measured.rounds, 2);
  assert.equal(measured.verifyCost, 4);
  assert.equal(measured.falseFixRuns, 0);
});

test('a saved repeat-2 replay rescored without full keeps the verify-cost ratio against the repeat-2 main cost', () => {
  const measured = { ...replayMeasures(writeReplay([goodRun, goodRun])), buildWall: 294.9487, buildCost: 0.95046258 };
  const parts = ratios(measured, tierFor({}));
  assert.ok(Math.abs(parts[1][1] - 4 / 4.6) < 1e-9);
});

test('a saved repeat-1 replay scores against half the main cost', () => {
  const measured = { ...replayMeasures(writeReplay([goodRun])), buildWall: 294.9487, buildCost: 0.95046258 };
  assert.ok(Math.abs(ratios(measured, tierFor({ full: true }))[1][1] - 2 / 2.3) < 1e-9);
});

test('a bad replay dir fails the fix-rate floor', () => {
  assert.throws(() => replayMeasures(writeReplay([badRun, badRun])), /below the floor/);
});

test('quick is the default tier and full restores the main repeat counts', () => {
  assert.deepEqual(tierFor({}), { name: 'quick', replayRepeat: 1, buildRepeat: 3 });
  assert.deepEqual(tierFor({ full: true }), { name: 'full', replayRepeat: 2, buildRepeat: 10 });
});

test('projected cost scales with the tier repeat counts', () => {
  assert.ok(Math.abs(projectedUsd(tierFor({ full: true })) - (4.6 + 0.95046258 * 10)) < 1e-9);
  assert.ok(projectedUsd(tierFor({})) < projectedUsd(tierFor({ full: true })));
});

test('dry-run prints child commands and projected usd without measuring', () => {
  const run = (...flags) => execFileSync(process.execPath, ['benchmarks/improve-all-score.mjs', '--dry-run', ...flags], { encoding: 'utf8' });
  const quick = run();
  assert.match(quick, /review-replay\.mjs.*--repeat 1/);
  assert.match(quick, /improve-speed\.mjs.*--repeat 3/);
  assert.match(quick, /projected usd \d+\.\d\d/);
  assert.match(run('--full'), /improve-speed\.mjs.*--repeat 10/);
});

const writeBuild = (cells) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-all-build-'));
  cells.forEach((record, index) => {
    const folder = path.join(directory, `cell-${index}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'record.json'), JSON.stringify({ exitCode: 0, timedOut: false, hiddenPass: true, defects: [], verifyRan: true, ...record }));
  });
  return directory;
};

const writeTasks = (runsByTask) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'improve-all-tasks-'));
  Object.entries(runsByTask).forEach(([task, runs]) => runs.forEach((run, index) => {
    const folder = path.join(directory, `${task}-${index}`);
    fs.mkdirSync(folder);
    fs.writeFileSync(path.join(folder, 'run.json'), JSON.stringify(run));
  }));
  return directory;
};

test('an aborted build cell fails the score instead of entering a mean', () => {
  const out = writeBuild([{ wallMs: 1000, costUsd: 1 }, { wallMs: 2000, costUsd: 1, timedOut: true }]);
  assert.throws(() => buildMeasures(out), /1 of 2 cells aborted/);
});

test('a build cell without a wall time or cost is left out of that mean and counted', () => {
  const out = writeBuild([{ wallMs: 1000, costUsd: 1, failures: [] }, { wallMs: 3000 }, { costUsd: 3 }]);
  const failing = buildMeasures(out);
  assert.deepEqual(failing.buildExcluded, { buildWall: 1, buildCost: 1 });
  assert.equal(failing.buildSamples.buildWall.length, 2);
});

test('a replay run without a cost is left out of the verify cost mean and counted', () => {
  const measured = replayMeasures(writeReplay([goodRun, { ...goodRun, costUsd: undefined }, goodRun]));
  assert.equal(measured.excluded.verifyCost, 1);
  assert.equal(measured.verifyCost, 6);
});

test('ratio statistics carry an SE over clustered tasks and say no SE for one run', () => {
  const tier = tierFor({});
  const many = replayMeasures(writeTasks({ a: [goodRun], b: [{ ...goodRun, roundsToClean: 3 }] }));
  const built = { ...many, buildWall: 294.9487, buildCost: 0.95046258, buildSamples: { buildWall: [{ cluster: 'x', value: 290 }, { cluster: 'y', value: 300 }], buildCost: [{ cluster: 'x', value: 1 }, { cluster: 'y', value: 0.9 }] }, buildExcluded: { buildWall: 0, buildCost: 0 } };
  const stats = ratioStats(built, tier);
  assert.ok(stats.every((stat) => stat.se !== null && stat.n === 2));
  assert.match(statLine(stats[0], tier), /^rounds ratio=\d\.\d{3} se=\d\.\d{3} n=2 excluded=0 quick$/);
  assert.match(scoreLine(stats), /^score se=\d\.\d{3}$/);
  const single = ratioStats({ ...replayMeasures(writeReplay([goodRun])), buildWall: 1, buildCost: 1 }, tier);
  assert.match(statLine(single[0], tier), /no SE/);
  assert.equal(scoreLine(single), 'score no SE');
});

test('each replay task becomes an ITEM score on the ratio scale', () => {
  const tier = tierFor({});
  const measured = { ...replayMeasures(writeTasks({ a: [goodRun], b: [{ ...goodRun, roundsToClean: 3 }] })), buildWall: 294.9487, buildCost: 0.95046258 };
  const items = taskItems(measured, tier);
  assert.deepEqual(items.map(([task]) => task), ['a', 'b']);
  assert.ok(items[1][1] > items[0][1]);
});
