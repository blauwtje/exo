import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { tempDir } from './harness.mjs';
import { CALIBRATION_MIN_LABELS, calibrationStatus, parseJsonl, statusLine } from '../lib/judge-agreement.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'skills', 'edit-skills', 'scripts', 'judge-calibration.mjs');
const writeJsonl = (file, rows) => fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
const readJsonl = (file) => fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
const runCli = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

function dirsWith(name, labels, verdicts) {
  const labelsDir = tempDir('judge-calibration-');
  const verdictsDir = tempDir('judge-calibration-');
  writeJsonl(path.join(labelsDir, `${name}.jsonl`), labels);
  writeJsonl(path.join(verdictsDir, `${name}.jsonl`), verdicts);
  return { labelsDir, verdictsDir };
}

const emptyDirs = () => ({ labelsDir: tempDir('judge-calibration-'), verdictsDir: tempDir('judge-calibration-') });
const dirFlags = ({ labelsDir, verdictsDir }) => ['--labels', labelsDir, '--verdicts', verdictsDir];

test('the CLI prints one line per grader, each naming its judge and dimension', () => {
  const run = runCli(...dirFlags(emptyDirs()));
  const lines = run.stdout.trim().split('\n');
  assert.deepEqual(lines.map((line) => line.split(' ')[1]), ['replay-rubric/case-rubric', 'pressure-line/rubric-line', 'adhd-facts/facts', 'ideas-originality/originality', 'ideas-fit/fit']);
});

test('a judge with no label file reads NO-LABELS', () => {
  const run = runCli('--judge', 'adhd-facts', ...dirFlags(emptyDirs()));
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^NO-LABELS adhd-facts\/facts kappa n\/a .* n 0 /);
});

test('a judge with 30 agreeing human labels of both kinds reads CALIBRATED; synthetic rows stay out of n', () => {
  const ids = Array.from({ length: 30 }, (_, index) => `x${index}`);
  const labels = [
    ...ids.map((id, index) => ({ id, dimension: 'facts', label: index % 2 ? 'PASS' : 'FAIL', labeler: 'rater-1' })),
    { id: 'built', dimension: 'facts', label: 'FAIL', built: { by: 'drop-fact' } },
  ];
  const verdicts = ids.map((id, index) => ({ id, dimension: 'facts', verdict: index % 2 ? 'PASS' : 'FAIL' }));
  const run = runCli('--judge', 'adhd-facts', ...dirFlags(dirsWith('adhd-facts', labels, verdicts)));
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^CALIBRATED adhd-facts\/facts .* n 30 .*synthetic_labels_unused 1$/m);
});

test('an unknown judge is a usage error that lists the known judges', () => {
  const run = runCli('--judge', 'nope', ...dirFlags(emptyDirs()));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /unknown judge 'nope'; known: replay-rubric, pressure-line, adhd-facts/);
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
  const dirs = emptyDirs();
  const collected = runCli('--judge', 'replay-rubric', '--collect', run, ...dirFlags(dirs));
  assert.equal(collected.status, 0);
  const file = path.join(dirs.verdictsDir, 'replay-rubric.jsonl');
  assert.match(collected.stdout, new RegExp(`^wrote 1 verdicts to ${file}$`, 'm'));
  const [row] = readJsonl(file);
  assert.deepEqual([row.id, row.dimension, row.verdict, row.item.rubric], ['a', 'case-rubric', 'PASS', 'r']);
});

test('collecting ideas records writes one verdict per option for the judge dimension', () => {
  const file = path.join(tempDir('judge-calibration-'), 'x.records.json');
  fs.writeFileSync(file, JSON.stringify({ records: [{ case: 'tide', run: 1, optionScores: [{ title: 't', mechanism: 'm', originality: 4, fit: 2 }] }] }));
  const dirs = emptyDirs();
  const collected = runCli('--judge', 'ideas-fit', '--collect', file, ...dirFlags(dirs));
  assert.equal(collected.status, 0);
  const [row] = readJsonl(path.join(dirs.verdictsDir, 'ideas-fit.jsonl'));
  assert.deepEqual([row.id, row.dimension, row.verdict], ['tide/1/t', 'fit', '2']);
});

test('collecting without a --judge, for a judge with no reader, or from an empty source is a usage error', () => {
  const dirs = emptyDirs();
  const source = tempDir('judge-calibration-');
  const noJudge = runCli('--collect', source, ...dirFlags(dirs));
  assert.equal(noJudge.status, 2);
  assert.match(noJudge.stderr, /--collect and --export need --judge/);
  const noReader = runCli('--judge', 'adhd-facts', '--collect', source, ...dirFlags(dirs));
  assert.equal(noReader.status, 2);
  assert.match(noReader.stderr, /adhd-facts has no stored-output reader/);
  const empty = runCli('--judge', 'replay-rubric', '--collect', source, ...dirFlags(dirs));
  assert.equal(empty.status, 2);
  assert.match(empty.stderr, /holds no replay-rubric verdicts/);
});

test('the labelling sheet carries the item but never the verdict, and leaves label and labeler empty', () => {
  const dirs = dirsWith('adhd-facts', [], [{ id: 'a', dimension: 'facts', verdict: 'PASS', item: { reply: 'r' } }]);
  const sheet = path.join(tempDir('judge-calibration-'), 'sheet.jsonl');
  const run = runCli('--judge', 'adhd-facts', '--export', sheet, ...dirFlags(dirs));
  assert.equal(run.status, 0);
  assert.match(run.stdout, new RegExp(`^wrote 1 rows to ${sheet}; fill label and labeler, then save as ${path.join(dirs.labelsDir, 'adhd-facts.jsonl')}$`, 'm'));
  const [row] = readJsonl(sheet);
  assert.deepEqual(row, { id: 'a', dimension: 'facts', item: { reply: 'r' }, label: null, labeler: null });
});

test('exporting without recorded verdicts is a usage error', () => {
  const sheet = path.join(tempDir('judge-calibration-'), 'sheet.jsonl');
  const run = runCli('--judge', 'adhd-facts', '--export', sheet, ...dirFlags(emptyDirs()));
  assert.equal(run.status, 2);
  assert.match(run.stderr, /no recorded verdicts for adhd-facts; run --collect first/);
  assert.equal(fs.existsSync(sheet), false);
});

test('the CLI exits 0 with NO-LABELS and 2 on a usage error', () => {
  const flags = dirFlags(emptyDirs());
  const plain = runCli(...flags);
  assert.equal(plain.status, 0);
  assert.match(plain.stdout, /^NO-LABELS replay-rubric\/case-rubric/m);
  const bad = runCli('--collect', 'x', ...flags);
  assert.equal(bad.status, 2);
});

const rows = (pairs) => ({
  labels: pairs.map(([label], index) => ({ id: `i${index}`, dimension: 'd', label, labeler: 'rater-1' })),
  verdicts: pairs.map(([, verdict], index) => ({ id: `i${index}`, dimension: 'd', verdict })),
});
const repeat = (pair, times) => Array.from({ length: times }, () => pair);

const statusOf = (pairs) => {
  const { labels, verdicts } = rows(pairs);
  return calibrationStatus({ labels, verdicts, dimension: 'd' });
};

test('kappa is 1 for full agreement over two categories and 0 for chance-level agreement', () => {
  const perfect = statusOf([...repeat(['PASS', 'PASS'], 5), ...repeat(['FAIL', 'FAIL'], 5)]);
  assert.equal(perfect.kappa, 1);
  const chance = statusOf([...repeat(['PASS', 'PASS'], 5), ...repeat(['PASS', 'FAIL'], 5), ...repeat(['FAIL', 'PASS'], 5), ...repeat(['FAIL', 'FAIL'], 5)]);
  assert.equal(chance.kappa, 0);
  assert.equal(chance.observed, 0.5);
});

test('kappa matches a worked example with its standard error and interval', () => {
  const pairs = [...repeat(['PASS', 'PASS'], 20), ...repeat(['PASS', 'FAIL'], 5), ...repeat(['FAIL', 'PASS'], 10), ...repeat(['FAIL', 'FAIL'], 15)];
  const result = statusOf(pairs);
  assert.ok(Math.abs(result.kappa - 0.4) < 1e-9);
  assert.ok(Math.abs(result.se - Math.sqrt((0.7 * 0.3) / (50 * 0.5 ** 2))) < 1e-9);
  assert.ok(Math.abs(result.hi - result.kappa - 1.96 * result.se) < 1e-9);
});

test('kappa is undefined when both sides use one category, and empty input has no rate', () => {
  assert.equal(statusOf(repeat(['PASS', 'PASS'], 4)).kappa, null);
  const none = statusOf([]);
  assert.deepEqual([none.n, none.rate, none.kappa], [0, null, null]);
});

test('agreement reports the rate with its own interval and the label count', () => {
  const result = statusOf([...repeat(['PASS', 'PASS'], 3), ['PASS', 'FAIL']]);
  assert.deepEqual([result.n, result.agree, result.rate], [4, 3, 0.75]);
  assert.ok(result.rateLo < result.rate && result.rateHi > result.rate);
});

test('synthetic rows never count as human labels', () => {
  const result = calibrationStatus({
    labels: [
      { id: 'a', dimension: 'facts', label: 'PASS', labeler: 'rater-1' },
      { id: 'b', dimension: 'facts', label: 'FAIL', built: { by: 'drop-fact' } },
      { id: 'c', dimension: 'facts', label: 'FAIL', synthetic: true },
      { id: 'd', dimension: 'facts', label: null },
    ],
    verdicts: [],
    dimension: 'facts',
  });
  assert.deepEqual([result.humanLabels, result.syntheticLabels], [1, 2]);
});

test('an item two labelers label differently is contested and left out; an item without a verdict is unmatched', () => {
  const labels = [
    { id: 'a', dimension: 'd', label: 'PASS', labeler: 'rater-1' },
    { id: 'a', dimension: 'd', label: 'FAIL', labeler: 'rater-2' },
    { id: 'b', dimension: 'd', label: 'pass', labeler: 'rater-1' },
    { id: 'b', dimension: 'd', label: 'PASS', labeler: 'rater-2' },
    { id: 'c', dimension: 'd', label: 'PASS', labeler: 'rater-1' },
  ];
  const paired = calibrationStatus({ labels, verdicts: [{ id: 'a', dimension: 'd', verdict: 'PASS' }, { id: 'b', dimension: 'd', verdict: 'unknown' }], dimension: 'd' });
  assert.deepEqual([paired.n, paired.agree, paired.observed], [1, 0, 0]);
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
