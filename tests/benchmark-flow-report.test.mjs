import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateFlow, flowReport, passDifference, readFlowRecords } from '../benchmarks/flow-report.mjs';

const arm = (passes, checked) => ({ passes, checked });

test('small pass-rate gaps read not better under Agresti-Caffo', () => {
  for (const [exo, baseline] of [[[1, 1], [0, 1]], [[2, 3], [0, 3]], [[3, 3], [1, 3]], [[3, 5], [0, 5]], [[4, 5], [1, 5]]]) {
    assert.equal(passDifference(arm(...exo), arm(...baseline)).better, false, `${exo.join('/')} vs ${baseline.join('/')}`);
  }
});

test('clear pass-rate gaps read better under Agresti-Caffo', () => {
  for (const [exo, baseline] of [[[3, 3], [0, 3]], [[4, 4], [0, 4]], [[5, 5], [0, 5]]]) {
    assert.equal(passDifference(arm(...exo), arm(...baseline)).better, true, `${exo.join('/')} vs ${baseline.join('/')}`);
  }
});

test('the observed and adjusted differences are both returned', () => {
  const result = passDifference(arm(3, 3), arm(0, 3));
  assert.equal(result.difference, 1);
  assert.ok(Math.abs(result.adjustedDifference - 0.6) < 1e-9);
});

test('an undefined baseline gives null', () => {
  assert.equal(passDifference(arm(1, 1), undefined), null);
});

test('an arm with one checked run has no SE and no better verdict', () => {
  const result = passDifference(arm(1, 1), arm(0, 1));
  assert.equal(result.noSe, true);
  assert.equal(result.better, false);
});

const record = (id, extra) => ({ kind: 'flow', id, hiddenPass: true, tokens: 1000, costUsd: 1, wallMs: 60000, ...extra });

test('timed-out and unfinished runs count as failures and stay out of the cost, tokens and wall means', () => {
  const [exo] = aggregateFlow([
    record('flow-c7', { costUsd: 1 }),
    record('flow-c7', { costUsd: 3, hiddenPass: true }),
    record('flow-c7', { costUsd: 50, timedOut: true, wallMs: 1e6 }),
    { kind: 'flow', id: 'flow-c7', unfinished: true }
  ]);
  assert.equal(exo.checked, 4);
  assert.equal(exo.passes, 2);
  assert.equal(exo.cost.mean, 2);
  assert.equal(exo.cost.n, 2);
  assert.equal(exo.cost.excluded, 2);
  assert.equal(exo.wall.mean, 60000);
});

test('the report prints a standard error and the excluded count beside each mean', () => {
  const text = flowReport([record('flow-c7', { costUsd: 1 }), record('flow-c7', { costUsd: 3 }), record('flow-base', { hiddenPass: false })]);
  assert.match(text, /cost mean \$2\.000 ±\$1\.000 SE \(n=2, excluded 0\)/);
  assert.match(text, /weighted tokens mean 1000 no SE \(n=1, excluded 0\)/);
});

test('an n=1 comparison prints no verdict instead of not better', () => {
  const text = flowReport([record('flow-c7', {}), record('flow-base', { hiddenPass: false })]);
  assert.match(text, /no SE \(an arm has under 2 checked runs\)/);
  assert.match(text, /no verdict \(no SE\)$/);
});

test('the report shows median, MAD and the runs beyond 3 MAD', () => {
  const runs = [10, 11, 12, 13, 500].map((tokens, index) => ({ kind: 'flow', id: 'flow-base', repeat: index + 1, tokens, costUsd: 1, wallMs: 60000 }));
  const [armSummary] = aggregateFlow(runs);
  assert.equal(armSummary.tokens.median, 12);
  assert.equal(armSummary.tokens.mad, 1);
  assert.deepEqual(armSummary.tokens.outliers, [{ run: 5, value: 500 }]);
  assert.deepEqual(armSummary.cost.outliers, []);
  assert.match(flowReport(runs), /tokens median 12, MAD 1, outliers beyond 3 MAD: run 5 500/);
});

test('an outlier names its real repeat when records sort as text', () => {
  const runs = [1, 10, 2, 3, 4, 5, 6, 7, 8, 9].map((repeat) => ({ kind: 'flow', id: 'flow-base', repeat, tokens: repeat === 10 ? 500 : 10 + (repeat % 3), costUsd: 1, wallMs: 60000 }));
  const [armSummary] = aggregateFlow(runs);
  assert.deepEqual(armSummary.tokens.outliers, [{ run: 10, value: 500 }]);
});

test('a record without repeat names its position and a stand-in without suffix repeats 1', () => {
  const runs = [10, 11, 12, 13, 500].map((tokens) => ({ kind: 'flow', id: 'flow-base', tokens, costUsd: 1, wallMs: 60000 }));
  assert.deepEqual(aggregateFlow(runs)[0].tokens.outliers, [{ run: 5, value: 500 }]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-report-'));
  fs.mkdirSync(path.join(dir, 'flow-base'));
  fs.mkdirSync(path.join(dir, 'flow-c7-2'));
  assert.deepEqual(readFlowRecords(dir).map((r) => r.repeat), [1, 2]);
});
