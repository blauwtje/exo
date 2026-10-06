import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { buildExport, writeMonth } from '../src/export/pipeline.mjs';
import { MINI, writeData } from './fixture.mjs';

test('buildExport totals each customer in EUR', () => {
  const lines = buildExport({ dataDir: writeData(), month: '2026-03' });
  assert.deepEqual(lines.map((line) => [line.customerId, line.transactions, line.totalMinor]), [['C001', 2, 17000], ['C002', 2, 27800]]);
});

test('a redelivered event and a repeated ledger entry count once', () => {
  const files = {
    ...MINI,
    'sources/ledger/2026-03.csv': `${MINI['sources/ledger/2026-03.csv']}2001,C001,invoice,120.00,EUR,posted,2026-03-06T10:00:00Z\n`
  };
  const lines = buildExport({ dataDir: writeData(files), month: '2026-03' });
  assert.equal(lines.find((line) => line.customerId === 'C001').totalMinor, 17000);
});

test('writeMonth writes <month>.csv into the output folder', () => {
  const outDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'billing-out-')), 'exports');
  const file = writeMonth({ dataDir: writeData(), outDir, month: '2026-03' });
  assert.equal(path.basename(file), '2026-03.csv');
  assert.equal(fs.readFileSync(file, 'utf8'), [
    'customer_id,customer,billing_currency,transactions,total_eur',
    'C001,Alder Works,EUR,2,170.00',
    'C002,Birch Supply,USD,2,278.00',
    ''
  ].join('\n'));
});
