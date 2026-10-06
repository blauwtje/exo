import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runReport } from '../src/pipeline.mjs';

const quiet = { debug() {}, info() {}, warn() {}, error() {} };

function run(transactions) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settle-'));
  fs.writeFileSync(path.join(dir, 't.csv'), `txn_id,date,merchant_id,amount,currency,status\n${transactions}`);
  fs.writeFileSync(path.join(dir, 'fx.csv'), 'date,currency,rate\n2026-03-06,USD,0.5\n');
  fs.writeFileSync(path.join(dir, 'm.csv'), 'merchant_id,name,onboarded\nM001,Alpha,2026-01-01\nM002,Beta,2026-01-01\n');
  return runReport({
    transactionsPath: path.join(dir, 't.csv'),
    fxPath: path.join(dir, 'fx.csv'),
    merchantsPath: path.join(dir, 'm.csv'),
    log: quiet,
  });
}

test('sums settled rows per merchant and in total', () => {
  const report = run(
    'T1,2026-03-06,M001,10.00,EUR,settled\nT2,2026-03-06,M002,10.00,USD,settled\nT3,2026-03-06,M001,-2.50,EUR,settled\n',
  );
  assert.equal(report.total_minor, 1250);
  assert.equal(report.merchants.M001.total_minor, 750);
  assert.equal(report.merchants.M002.total_minor, 500);
});

test('pending, failed and repeated rows do not count', () => {
  const report = run(
    'T1,2026-03-06,M001,10.00,EUR,settled\nT1,2026-03-06,M001,10.00,EUR,settled\nT2,2026-03-06,M001,5.00,EUR,pending\nT3,2026-03-06,M001,5.00,EUR,failed\n',
  );
  assert.equal(report.total_minor, 1000);
  assert.deepEqual(report.rows.skipped, { pending: 1, failed: 1, duplicate: 1, unparseable: 0 });
});
