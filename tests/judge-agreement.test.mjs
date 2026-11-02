import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { CALIBRATION_MIN_LABELS, agreement, calibrationStatus, cohenKappa, pairVerdicts, parseJsonl, splitLabels, statusLine } from '../lib/judge-agreement.mjs';

const rows = (pairs, dimension = 'd') => ({
  labels: pairs.map(([label], index) => ({ id: `i${index}`, dimension, label, labeler: 'rater-1' })),
  verdicts: pairs.map(([, verdict], index) => ({ id: `i${index}`, dimension, verdict })),
});
const repeat = (pair, times) => Array.from({ length: times }, () => pair);

test('kappa is 1 for full agreement over two categories and 0 for chance-level agreement', () => {
  const perfect = cohenKappa([...repeat(['PASS', 'PASS'], 5), ...repeat(['FAIL', 'FAIL'], 5)]);
  assert.equal(perfect.kappa, 1);
  const chance = cohenKappa([...repeat(['PASS', 'PASS'], 5), ...repeat(['PASS', 'FAIL'], 5), ...repeat(['FAIL', 'PASS'], 5), ...repeat(['FAIL', 'FAIL'], 5)]);
  assert.equal(chance.kappa, 0);
  assert.equal(chance.observed, 0.5);
});

test('kappa matches a worked example with its standard error and interval', () => {
  const pairs = [...repeat(['PASS', 'PASS'], 20), ...repeat(['PASS', 'FAIL'], 5), ...repeat(['FAIL', 'PASS'], 10), ...repeat(['FAIL', 'FAIL'], 15)];
  const result = cohenKappa(pairs);
  assert.ok(Math.abs(result.kappa - 0.4) < 1e-9);
  assert.ok(Math.abs(result.se - Math.sqrt((0.7 * 0.3) / (50 * 0.5 ** 2))) < 1e-9);
  assert.ok(Math.abs(result.hi - result.kappa - 1.96 * result.se) < 1e-9);
});

test('kappa is undefined when both sides use one category, and empty input has no rate', () => {
  assert.equal(cohenKappa(repeat(['PASS', 'PASS'], 4)).kappa, null);
  const none = agreement([]);
  assert.deepEqual([none.n, none.rate, none.kappa], [0, null, null]);
});

test('agreement reports the rate with its own interval and the label count', () => {
  const result = agreement([...repeat(['PASS', 'PASS'], 3), ['PASS', 'FAIL']]);
  assert.deepEqual([result.n, result.agree, result.rate], [4, 3, 0.75]);
  assert.ok(result.rateLo < result.rate && result.rateHi > result.rate);
});

test('synthetic rows never count as human labels', () => {
  const split = splitLabels([
    { id: 'a', dimension: 'facts', label: 'PASS', labeler: 'rater-1' },
    { id: 'b', dimension: 'facts', label: 'FAIL', built: { by: 'drop-fact' } },
    { id: 'c', dimension: 'facts', label: 'FAIL', synthetic: true },
    { id: 'd', dimension: 'facts', label: null },
  ]);
  assert.deepEqual([split.human.length, split.synthetic.length], [1, 2]);
});

test('an item two labelers label differently is contested and left out; an item without a verdict is unmatched', () => {
  const labels = [
    { id: 'a', dimension: 'd', label: 'PASS', labeler: 'rater-1' },
    { id: 'a', dimension: 'd', label: 'FAIL', labeler: 'rater-2' },
    { id: 'b', dimension: 'd', label: 'pass', labeler: 'rater-1' },
    { id: 'b', dimension: 'd', label: 'PASS', labeler: 'rater-2' },
    { id: 'c', dimension: 'd', label: 'PASS', labeler: 'rater-1' },
  ];
  const paired = pairVerdicts({ labels, verdicts: [{ id: 'a', dimension: 'd', verdict: 'PASS' }, { id: 'b', dimension: 'd', verdict: 'unknown' }], dimension: 'd' });
  assert.deepEqual(paired.pairs, [['PASS', 'UNKNOWN']]);
  assert.deepEqual([paired.contested, paired.unmatched, paired.unknown, paired.labelers], [1, 1, 1, 2]);
});

test('no human labels reads NO-LABELS and never fails', () => {
  const synthetic = [{ id: 'a', dimension: 'd', label: 'FAIL', built: {} }];
  const result = calibrationStatus({ labels: synthetic, verdicts: [], dimension: 'd' });
  assert.deepEqual([result.status, result.failing, result.syntheticLabels], ['NO-LABELS', false, 1]);
});

test('fewer paired labels than the minimum reads UNCALIBRATED without failing', () => {
  const { labels, verdicts } = rows(repeat(['PASS', 'PASS'], CALIBRATION_MIN_LABELS - 1));
  const result = calibrationStatus({ labels, verdicts, dimension: 'd' });
  assert.deepEqual([result.status, result.failing], ['UNCALIBRATED', false]);
});

test('enough labels with a strong kappa lower bound read CALIBRATED', () => {
  const { labels, verdicts } = rows([...repeat(['PASS', 'PASS'], 30), ...repeat(['FAIL', 'FAIL'], 30)]);
  const result = calibrationStatus({ labels, verdicts, dimension: 'd' });
  assert.deepEqual([result.status, result.failing, result.n], ['CALIBRATED', false, 60]);
});

test('enough labels with a weak kappa read UNCALIBRATED and fail', () => {
  const { labels, verdicts } = rows([...repeat(['PASS', 'PASS'], 20), ...repeat(['PASS', 'FAIL'], 10), ...repeat(['FAIL', 'PASS'], 10), ...repeat(['FAIL', 'FAIL'], 20)]);
  const result = calibrationStatus({ labels, verdicts, dimension: 'd' });
  assert.deepEqual([result.status, result.failing], ['UNCALIBRATED', true]);
  assert.match(statusLine({ judge: 'j', dimension: 'd', result }), /^UNCALIBRATED j\/d kappa 0\.33 ci .* n 60 agreement 0\.67$/);
});

test('parseJsonl names the bad line', () => {
  assert.deepEqual(parseJsonl('{"a":1}\n\n{"a":2}\n'), [{ a: 1 }, { a: 2 }]);
  assert.throws(() => parseJsonl('{"a":1}\nnope'), /line 2 is not JSON/);
});

test('the calibration minimum and kappa floor come from defaults.eval', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-defaults-'));
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { eval: { calibrationMinLabels: 12, calibrationKappaFloor: 0.7 } } }));
  const script = "import('./lib/judge-agreement.mjs').then((m) => console.log(JSON.stringify([m.CALIBRATION_MIN_LABELS, m.CALIBRATION_KAPPA_FLOOR])))";
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [12, 0.7]);
});
