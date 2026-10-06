import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthSummary, renderSummary } from '../src/dashboard/summary.mjs';
import { buildExport } from '../src/export/pipeline.mjs';
import { writeData } from './fixture.mjs';

test('monthSummary totals each customer in EUR', () => {
  const entries = monthSummary({ dataDir: writeData(), month: '2026-03' });
  assert.deepEqual(entries.map((entry) => [entry.id, entry.transactions, entry.totalMinor]), [['C001', 2, 17000], ['C002', 2, 27800]]);
});

test('the dashboard and the export agree on the sample month', () => {
  const dataDir = writeData();
  const dashboard = monthSummary({ dataDir, month: '2026-03' }).map((entry) => [entry.id, entry.totalMinor]);
  const exported = buildExport({ dataDir, month: '2026-03' }).map((line) => [line.customerId, line.totalMinor]);
  assert.deepEqual(exported, dashboard);
});

test('renderSummary prints one line per customer and a grand total', () => {
  const text = renderSummary(monthSummary({ dataDir: writeData(), month: '2026-03' }));
  const lines = text.split('\n');
  assert.equal(lines.length, 3);
  assert.match(lines[1], /C002 {2}Birch Supply {2} *EUR 278\.00 {2}2 transactions/);
  assert.match(lines[2], /total EUR 448\.00$/);
});
