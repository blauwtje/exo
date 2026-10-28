import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { geometricMean, projectedUsd, ratios, replayMeasures, tierFor } from '../benchmarks/improve-all-score.mjs';

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
