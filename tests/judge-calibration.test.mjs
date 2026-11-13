import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { calibrationFor, collectVerdicts, exportSheet, readRegistry } from '../skills/edit-skills/scripts/judge-calibration.mjs';
import { tempDir } from './harness.mjs';
import { CALIBRATION_MIN_LABELS, agreement, calibrationStatus, cohenKappa, pairVerdicts, parseJsonl, splitLabels, statusLine } from '../lib/judge-agreement.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'skills', 'edit-skills', 'scripts', 'judge-calibration.mjs');
const judgeNamed = (name) => readRegistry().find((judge) => judge.name === name);
const writeJsonl = (file, rows) => fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

function dirsWith(name, labels, verdicts) {
  const labelsDir = tempDir('judge-calibration-');
  const verdictsDir = tempDir('judge-calibration-');
  writeJsonl(path.join(labelsDir, `${name}.jsonl`), labels);
  writeJsonl(path.join(verdictsDir, `${name}.jsonl`), verdicts);
  return { labelsDir, verdictsDir };
}

test('the registry gives every grader exactly one dimension and every transform none', () => {
  for (const judge of readRegistry()) {
    if (judge.kind === 'grader') assert.equal(typeof judge.dimension, 'string', judge.name);
    else assert.equal(judge.dimension, undefined, judge.name);
  }
});

test('a judge with no label file reads NO-LABELS', () => {
  const dirs = { labelsDir: tempDir('judge-calibration-'), verdictsDir: tempDir('judge-calibration-') };
  const { result, line } = calibrationFor(judgeNamed('adhd-facts'), dirs);
  assert.equal(result.status, 'NO-LABELS');
  assert.match(line, /^NO-LABELS adhd-facts\/facts kappa n\/a .* n 0 /);
});

test('a judge with 30 agreeing human labels of both kinds reads CALIBRATED; synthetic rows stay out of n', () => {
  const ids = Array.from({ length: 30 }, (_, index) => `x${index}`);
  const labels = [
    ...ids.map((id, index) => ({ id, dimension: 'facts', label: index % 2 ? 'PASS' : 'FAIL', labeler: 'rater-1' })),
    { id: 'built', dimension: 'facts', label: 'FAIL', built: { by: 'drop-fact' } },
  ];
  const verdicts = ids.map((id, index) => ({ id, dimension: 'facts', verdict: index % 2 ? 'PASS' : 'FAIL' }));
  const { result, line } = calibrationFor(judgeNamed('adhd-facts'), dirsWith('adhd-facts', labels, verdicts));
  assert.deepEqual([result.status, result.n, result.syntheticLabels], ['CALIBRATED', 30, 1]);
  assert.match(line, /synthetic_labels_unused 1$/);
});

test('collecting replay grades writes verdicts for judged rubric cells only', () => {
  const run = tempDir('judge-calibration-');
  const cell = (name, grade, extra) => {
    const dir = path.join(run, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'grade.json'), JSON.stringify(grade));
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(extra));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ result: 'answer text' }));
  };
  cell('a', { grade: 'pass', votes: ['pass'] }, { grade: { type: 'rubric', rubric: 'r' } });
  cell('b', { grade: 'fail' }, { grade: { type: 'regex' } });
  const verdictsDir = tempDir('judge-calibration-');
  const { rows } = collectVerdicts(judgeNamed('replay-rubric'), run, verdictsDir);
  assert.equal(rows, 1);
  const [row] = fs.readFileSync(path.join(verdictsDir, 'replay-rubric.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([row.id, row.dimension, row.verdict, row.item.rubric], ['a', 'case-rubric', 'PASS', 'r']);
});

test('collecting ideas records writes one verdict per option for the judge dimension', () => {
  const file = path.join(tempDir('judge-calibration-'), 'x.records.json');
  fs.writeFileSync(file, JSON.stringify({ records: [{ case: 'tide', run: 1, optionScores: [{ title: 't', mechanism: 'm', originality: 4, fit: 2 }] }] }));
  const verdictsDir = tempDir('judge-calibration-');
  collectVerdicts(judgeNamed('ideas-fit'), file, verdictsDir);
  const [row] = fs.readFileSync(path.join(verdictsDir, 'ideas-fit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([row.id, row.dimension, row.verdict], ['tide/1/t', 'fit', '2']);
});

test('the labelling sheet carries the item but never the verdict, and leaves label and labeler empty', () => {
  const dirs = dirsWith('adhd-facts', [], [{ id: 'a', dimension: 'facts', verdict: 'PASS', item: { reply: 'r' } }]);
  const sheet = path.join(tempDir('judge-calibration-'), 'sheet.jsonl');
  assert.equal(exportSheet(judgeNamed('adhd-facts'), sheet, dirs.verdictsDir), 1);
  const [row] = fs.readFileSync(sheet, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(row, { id: 'a', dimension: 'facts', item: { reply: 'r' }, label: null, labeler: null });
});

test('the CLI exits 0 with NO-LABELS and 2 on a usage error', () => {
  const dirs = { labelsDir: tempDir('judge-calibration-'), verdictsDir: tempDir('judge-calibration-') };
  const flags = ['--labels', dirs.labelsDir, '--verdicts', dirs.verdictsDir];
  const plain = spawnSync(process.execPath, [SCRIPT, ...flags], { encoding: 'utf8' });
  assert.equal(plain.status, 0);
  assert.match(plain.stdout, /^NO-LABELS replay-rubric\/case-rubric/m);
  const bad = spawnSync(process.execPath, [SCRIPT, '--collect', 'x', ...flags], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});

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
  const home = tempDir('eval-defaults-');
  fs.mkdirSync(path.join(home, '.config', 'exo'), { recursive: true });
  fs.writeFileSync(path.join(home, '.config', 'exo', 'run.json'), JSON.stringify({ defaults: { eval: { calibrationMinLabels: 12, calibrationKappaFloor: 0.7 } } }));
  const script = "import('./lib/judge-agreement.mjs').then((m) => console.log(JSON.stringify([m.CALIBRATION_MIN_LABELS, m.CALIBRATION_KAPPA_FLOOR])))";
  const run = spawnSync(process.execPath, ['-e', script], { cwd: path.join(import.meta.dirname, '..'), encoding: 'utf8', env: { ...process.env, HOME: home } });
  assert.equal(run.status, 0, run.stderr);
  assert.deepEqual(JSON.parse(run.stdout), [12, 0.7]);
});
