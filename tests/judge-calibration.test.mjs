import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { QUICK_ITEMS, calibrationFor, collectVerdicts, exportSheet, readRegistry, rerunPlan } from '../benchmarks/judge-calibration.mjs';

const SCRIPT = path.join(import.meta.dirname, '..', 'benchmarks', 'judge-calibration.mjs');
const judgeNamed = (name) => readRegistry().find((judge) => judge.name === name);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'judge-calibration-'));
const writeJsonl = (file, rows) => fs.writeFileSync(file, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);

function dirsWith(name, labels, verdicts) {
  const labelsDir = tmp();
  const verdictsDir = tmp();
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
  const dirs = { labelsDir: tmp(), verdictsDir: tmp() };
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
  const run = tmp();
  const cell = (name, grade, extra) => {
    const dir = path.join(run, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'grade.json'), JSON.stringify(grade));
    fs.writeFileSync(path.join(dir, 'case.json'), JSON.stringify(extra));
    fs.writeFileSync(path.join(dir, 'result.json'), JSON.stringify({ result: 'answer text' }));
  };
  cell('a', { grade: 'pass', votes: ['pass'] }, { grade: { type: 'rubric', rubric: 'r' } });
  cell('b', { grade: 'fail' }, { grade: { type: 'regex' } });
  const verdictsDir = tmp();
  const { rows } = collectVerdicts(judgeNamed('replay-rubric'), run, verdictsDir);
  assert.equal(rows, 1);
  const [row] = fs.readFileSync(path.join(verdictsDir, 'replay-rubric.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([row.id, row.dimension, row.verdict, row.item.rubric], ['a', 'case-rubric', 'PASS', 'r']);
});

test('collecting ideas records writes one verdict per option for the judge dimension', () => {
  const file = path.join(tmp(), 'x.records.json');
  fs.writeFileSync(file, JSON.stringify({ records: [{ case: 'tide', run: 1, optionScores: [{ title: 't', mechanism: 'm', originality: 4, fit: 2 }] }] }));
  const verdictsDir = tmp();
  collectVerdicts(judgeNamed('ideas-fit'), file, verdictsDir);
  const [row] = fs.readFileSync(path.join(verdictsDir, 'ideas-fit.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual([row.id, row.dimension, row.verdict], ['tide/1/t', 'fit', '2']);
});

test('the labelling sheet carries the item but never the verdict, and leaves label and labeler empty', () => {
  const dirs = dirsWith('adhd-facts', [], [{ id: 'a', dimension: 'facts', verdict: 'PASS', item: { reply: 'r' } }]);
  const sheet = path.join(tmp(), 'sheet.jsonl');
  assert.equal(exportSheet(judgeNamed('adhd-facts'), sheet, dirs.verdictsDir), 1);
  const [row] = fs.readFileSync(sheet, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(row, { id: 'a', dimension: 'facts', item: { reply: 'r' }, label: null, labeler: null });
});

test('the quick rerun plan takes the first labelled items with one vote; full takes all with three', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const labels = ids.map((id) => ({ id, dimension: 'facts', label: 'PASS', labeler: 'rater-1' }));
  const verdicts = ids.map((id) => ({ id, dimension: 'facts', verdict: 'PASS', item: {} }));
  const dirs = dirsWith('adhd-facts', labels, verdicts);
  const quick = rerunPlan(judgeNamed('adhd-facts'), { ...dirs, full: false });
  assert.deepEqual([quick.tier, quick.items.length, quick.calls], ['quick', QUICK_ITEMS, QUICK_ITEMS]);
  const full = rerunPlan(judgeNamed('adhd-facts'), { ...dirs, full: true });
  assert.deepEqual([full.tier, full.items.length, full.calls], ['full', 5, 15]);
});

test('--rerun --dry-run spends nothing and the CLI exits 0 with NO-LABELS', () => {
  const dirs = { labelsDir: tmp(), verdictsDir: tmp() };
  const flags = ['--labels', dirs.labelsDir, '--verdicts', dirs.verdictsDir];
  const dry = spawnSync(process.execPath, [SCRIPT, '--judge', 'adhd-facts', '--rerun', '--dry-run', ...flags], { encoding: 'utf8' });
  assert.match(dry.stdout, /quick tier, 0 labelled items, 0 judge calls, nothing spent/);
  const plain = spawnSync(process.execPath, [SCRIPT, ...flags], { encoding: 'utf8' });
  assert.equal(plain.status, 0);
  assert.match(plain.stdout, /^NO-LABELS replay-rubric\/case-rubric/m);
  const bad = spawnSync(process.execPath, [SCRIPT, '--collect', 'x', ...flags], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
