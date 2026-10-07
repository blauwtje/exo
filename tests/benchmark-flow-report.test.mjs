// The flow report: per-arm aggregation of the flow cells' records across out
// dirs, and the exo-better verdict from the pass-rate difference.

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregateFlow, flowReport, passDifference, readFlowRecords } from '../benchmarks/flow-report.mjs';

function record(id, fields) {
  return { id, kind: 'flow', tokens: 1000, costUsd: 2, wallMs: 60000, landed: 4, total: 4, hiddenPass: true, defects: [], ...fields };
}

async function outDirectory(records) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'flow-report-'));
  for (const entry of records) {
    await fs.mkdir(path.join(directory, entry.id), { recursive: true });
    await fs.writeFile(path.join(directory, entry.id, 'record.json'), JSON.stringify(entry));
  }
  await fs.mkdir(path.join(directory, 'plan-opus-high'));
  await fs.writeFile(path.join(directory, 'plan-opus-high', 'record.json'), JSON.stringify({ id: 'plan-opus-high', kind: 'plan' }));
  return directory;
}

test('aggregation groups records by arm and averages each figure', () => {
  const arms = aggregateFlow([
    record('flow-base', { landed: 2, hiddenPass: false, defects: ['a', 'b'], tokens: 3000, costUsd: 1, wallMs: 120000 }),
    record('flow-c7', { tokens: 1000, costUsd: 2, wallMs: 60000 }),
    record('flow-c7', { landed: 3, hiddenPass: false, defects: ['x'], tokens: 2000, costUsd: 4, wallMs: 180000 }),
    record('flow-base', { landed: 4, defects: [], tokens: 1000, costUsd: 3, wallMs: 60000 })
  ]);
  assert.deepEqual(arms.map((arm) => arm.id), ['flow-c7', 'flow-base']);
  const [exo, baseline] = arms;
  assert.equal(exo.n, 2);
  assert.equal(exo.landedFractionMean, 0.875);
  assert.equal(exo.landedSum, 7);
  assert.equal(exo.totalSum, 8);
  assert.equal(exo.passes, 1);
  assert.equal(exo.defectsTotal, 1);
  assert.equal(exo.defectsMean, 0.5);
  assert.equal(exo.tokensMean, 1500);
  assert.equal(exo.costMean, 3);
  assert.equal(exo.costTotal, 6);
  assert.equal(exo.wallMeanMs, 120000);
  assert.equal(baseline.landedFractionMean, 0.75);
  assert.equal(baseline.passes, 1);
  assert.equal(baseline.defectsTotal, 2);
});

test('cost per success is every record\'s cost over the hidden-check passes, none when nothing passes', () => {
  const [exo, baseline] = aggregateFlow([
    record('flow-c7', { hiddenPass: true, costUsd: 2 }),
    record('flow-c7', { hiddenPass: false, costUsd: 4 }),
    record('flow-base', { hiddenPass: false, costUsd: 1 })
  ]);
  assert.equal(exo.costPerSuccess, 6);
  assert.equal(baseline.costPerSuccess, null);
  const report = flowReport([record('flow-c7', { costUsd: 2 }), record('flow-c7', { hiddenPass: false, costUsd: 4 }), record('flow-base', { hiddenPass: false })]);
  assert.match(report, /^flow-c7:[\s\S]*cost per success \$6\.000/m);
  assert.match(report, /^flow-base:[\s\S]*cost per success none/m);
});

test('a record from before the hidden check drops out of the landed and pass figures only', () => {
  const [arm] = aggregateFlow([record('flow-c7', { landed: undefined, total: undefined, hiddenPass: undefined, defects: undefined }), record('flow-c7', {})]);
  assert.equal(arm.n, 2);
  assert.equal(arm.checked, 1);
  assert.equal(arm.landedSum, 4);
  assert.equal(arm.defectsTotal, 0);
  assert.equal(arm.costTotal, 4);
});

test('the verdict is exo better only when the pass-rate difference exceeds two standard errors', () => {
  const run = (exoPasses, basePasses, count) => aggregateFlow([
    ...Array.from({ length: count }, (_, index) => record('flow-c7', { hiddenPass: index < exoPasses })),
    ...Array.from({ length: count }, (_, index) => record('flow-base', { hiddenPass: index < basePasses }))
  ]);
  const [clearExo, clearBase] = run(5, 0, 5);
  const clear = passDifference(clearExo, clearBase);
  assert.equal(clear.difference, 1);
  assert.equal(clear.twoStandardErrors, 0);
  assert.equal(clear.better, true);
  const [closeExo, closeBase] = run(4, 2, 5);
  const close = passDifference(closeExo, closeBase);
  assert.ok(Math.abs(close.difference - 0.4) < 1e-9);
  assert.ok(Math.abs(close.twoStandardErrors - 2 * Math.sqrt(0.8 * 0.2 / 5 + 0.4 * 0.6 / 5)) < 1e-9);
  assert.equal(close.better, false);
  assert.equal(passDifference(closeExo, undefined), null);
});

test('the report reads the flow records of several out dirs and prints each arm and the verdict', async () => {
  const first = await outDirectory([record('flow-c7', {}), record('flow-base', { landed: 1, hiddenPass: false, defects: ['no words test'] })]);
  const second = await outDirectory([record('flow-c7', {}), record('flow-base', { hiddenPass: false })]);
  const records = [...readFlowRecords(first), ...readFlowRecords(second)];
  assert.equal(records.length, 4);
  const text = flowReport(records);
  assert.match(text, /^flow-c7: n=2$/m);
  assert.match(text, /^flow-base: n=2$/m);
  assert.match(text, /tasks landed mean 100%, sum 8\/8/);
  assert.match(text, /tasks landed mean 63%, sum 5\/8/);
  assert.match(text, /hidden pass 2\/2/);
  assert.match(text, /hidden pass 0\/2/);
  assert.match(text, /defects total 1, mean 0\.50/);
  assert.match(text, /cost mean \$2\.000, total \$4\.000/);
  assert.match(text, /^exo better$/m);
});

test('an arm with no hidden-check result is not better', () => {
  assert.match(flowReport([record('flow-c7', {})]), /^not better$/m);
  assert.equal(flowReport([]), 'No flow records found.');
});
