import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  ALPHA, POWER, TARGET_EFFECT, designVariance, evalDefaults, detectableEffect, normalQuantile, planningVariance, powerLine, rateVariance, scoreVariance, tasksNeeded, zSum
} from '../lib/eval-stats.mjs';
import { minDetectableEffect, nextRuns } from '../benchmarks/statistics.mjs';
import { tempDir } from './harness.mjs';

const near = (actual, expected, tolerance = 1e-5) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not ${expected}`);

test('the tunables default to the worked example: 3 points, alpha 0.05, power 0.8', () => {
  assert.deepEqual([TARGET_EFFECT, ALPHA, POWER], [0.03, 0.05, 0.8]);
});

test('normalQuantile returns the standard normal quantiles and refuses 0 and 1', () => {
  near(normalQuantile(0.975), 1.959964);
  near(normalQuantile(0.8), 0.841621);
  near(normalQuantile(0.5), 0, 1e-6);
  assert.throws(() => normalQuantile(0), RangeError);
  assert.throws(() => normalQuantile(1), RangeError);
});

test('zSum adds the two-sided alpha quantile and the power quantile', () => {
  near(zSum(), 2.801585);
  near(zSum({ alpha: 0.1, power: 0.9 }), 1.644854 + 1.281552);
  assert.throws(() => zSum({ alpha: 0 }), RangeError);
});

test('Eq. 9 reproduces n = 969 for omega2 = 1/9, sigma2 = 0, delta = 0.03, alpha = 0.05, power = 0.8', () => {
  const variance = designVariance({ omega2: 1 / 9, sigma2: 0 });
  assert.equal(tasksNeeded({ variance, effect: 0.03 }), 969);
});

test('Eq. 10 gives the delta that Eq. 9 sized, at that n', () => {
  const variance = 1 / 9;
  near(detectableEffect({ variance, tasks: 969 }), 0.03, 1e-4);
  assert.ok(detectableEffect({ variance, tasks: 969 }) <= 0.03);
  assert.ok(detectableEffect({ variance, tasks: 968 }) > 0.03 - 1e-6);
});

test('zero variance still needs one task', () => {
  assert.equal(tasksNeeded({ variance: 0 }), 1);
});

test('samples per task shrink only the within-task part of the variance', () => {
  assert.equal(designVariance({ omega2: 0.1, sigma2: 0.2, samples: 1 }), 0.5);
  near(designVariance({ omega2: 0.1, sigma2: 0.2, samples: 4 }), 0.2, 1e-12);
  assert.equal(designVariance({ omega2: 0.1, sigma2: 0, samples: 9 }), 0.1);
  assert.throws(() => designVariance({ omega2: 0.1, samples: 0 }), RangeError);
});

test('tasksNeeded and detectableEffect refuse a zero effect and zero tasks', () => {
  assert.throws(() => tasksNeeded({ variance: 0.1, effect: 0 }), RangeError);
  assert.throws(() => detectableEffect({ variance: 0.1, tasks: 0 }), RangeError);
});

test('a paired pass-rate design needs fewer tasks than an unpaired one', () => {
  const unpaired = tasksNeeded({ variance: planningVariance({ rate: 0.5 }) });
  const paired = tasksNeeded({ variance: planningVariance({ rate: 0.5, paired: true }) });
  assert.ok(paired < unpaired);
  near(paired / unpaired, 0.5, 0.01);
  assert.deepEqual(rateVariance({ rate: 0.5 }), { omega2: 0.5, sigma2: 0 });
  near(rateVariance({ rate: 0.5, paired: true, correlation: 0.7 }).omega2, 0.15, 1e-12);
  assert.throws(() => rateVariance({ rate: 1 }), RangeError);
});

test('scoreVariance splits recorded per-task scores into task spread and within-task noise', () => {
  const base = { a: [0, 0], b: [1, 1], c: [0, 0], d: [1, 1] };
  const candidate = { a: [1, 1], b: [1, 1], c: [0, 0], d: [1, 1] };
  const paired = scoreVariance({ base, candidate, paired: true });
  assert.equal(paired.sigma2, 0);
  assert.equal(paired.tasks, 4);
  assert.equal(paired.samples, 2);
  near(paired.omega2, 0.25, 1e-12);
  const unpaired = scoreVariance({ base, candidate, paired: false });
  near(unpaired.omega2, 1 / 3 + 1 / 4, 1e-12);
});

test('scoreVariance subtracts the noise a task mean carries and never goes below zero', () => {
  const noisy = { a: [0, 1], b: [1, 0], c: [0, 1] };
  const result = scoreVariance({ base: noisy, candidate: noisy, paired: false });
  assert.equal(result.omega2, 0);
  near(result.sigma2, 0.5, 1e-12);
});

test('scoreVariance on shared tasks only, and refuses fewer than two tasks', () => {
  const result = scoreVariance({ base: { a: [0], b: [1], x: [1] }, candidate: { a: [1], b: [1], y: [0] }, paired: true });
  assert.equal(result.tasks, 2);
  assert.throws(() => scoreVariance({ base: { a: [0] }, candidate: { b: [1] }, paired: true }), RangeError);
  assert.throws(() => scoreVariance({ base: { a: [0] }, candidate: { a: [1], b: [1] }, paired: false }), RangeError);
});

test('planningVariance takes recorded scores over a rate and applies the planned samples', () => {
  const scores = { base: { a: [0, 1], b: [1, 0], c: [0, 1] }, candidate: { a: [1, 1], b: [0, 0], c: [1, 0] } };
  const once = planningVariance({ scores, samples: 1 });
  const fourTimes = planningVariance({ scores, samples: 4 });
  assert.ok(fourTimes < once);
});

test('powerLine prints the planned size, the tasks the target needs and the MDE at the plan', () => {
  const line = powerLine({ tasks: 30, samples: 3, rate: 0.5 });
  assert.equal(line.includes('\n'), false);
  assert.match(line, /^power: 30 tasks x 3 samples x 2 arms = 180 runs; /);
  assert.match(line, /an effect of 0\.03 needs 4361 tasks \(alpha 0\.05, power 0\.8\)/);
  assert.match(line, /MDE at 30 tasks is 0\.362$/);
});

test('powerLine follows the target effect, alpha and power it is given', () => {
  const line = powerLine({ tasks: 100, rate: 0.5, effect: 0.1, alpha: 0.1, power: 0.9, paired: true });
  assert.match(line, /an effect of 0\.1 needs \d+ tasks \(alpha 0\.1, power 0\.9\)/);
  assert.throws(() => powerLine({ tasks: 0, rate: 0.5 }), RangeError);
});

test('the benchmark helpers give the same numbers through the shared formulas', () => {
  assert.equal(nextRuns(0.25), 12);
  near(minDetectableEffect({ rate: 0.5, n: 100 }), 2.84 * Math.sqrt(0.005), 1e-12);
});

test('the mde script prints the power line', () => {
  const mde = path.join(import.meta.dirname, '..', 'benchmarks', 'mde.mjs');
  const run = spawnSync(process.execPath, [mde, '--rate', '0.5', '--n', '100', '--samples', '3', '--effect', '0.1', '--paired'], { encoding: 'utf8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /power: 100 tasks x 3 samples x 2 arms = 600 runs; an effect of 0\.1 needs 197 tasks/);
  const bad = spawnSync(process.execPath, [mde, '--rate', '0.5', '--n', '5', '--samples', '0'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

test('the planning tunables come from defaults.eval and a user run.json overrides them', () => {
  const home = tempDir('eval-defaults-');
  assert.deepEqual(evalDefaults(home), { targetEffect: 0.03, alpha: 0.05, power: 0.8, pairedCorrelation: 0.5, calibrationMinLabels: 30, calibrationKappaFloor: 0.6, graduationRuns: 20, realFailuresMin: 20, ideaScreenCapUsd: 20, ideaConfirmCapUsd: 100 });
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { eval: { targetEffect: 0.05, alpha: 0.1, power: 0.9, pairedCorrelation: 0.25 } } }));
  assert.equal(evalDefaults(home).graduationRuns, 20);
  const script = "import('./lib/eval-stats.mjs').then((m) => console.log(JSON.stringify([m.TARGET_EFFECT, m.ALPHA, m.POWER, m.rateVariance({ rate: 0.5, paired: true }).omega2])))";
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [0.05, 0.1, 0.9, 0.375]);
});
