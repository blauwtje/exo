import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysBetween, isIsoDate, monthOf } from '../lib/dates.mjs';
import { nextId } from '../lib/ids.mjs';
import { freshDatabase } from './support.mjs';

test('isIsoDate accepts real calendar days only', () => {
  assert.equal(isIsoDate('2026-03-14'), true);
  assert.equal(isIsoDate('2024-02-29'), true);
  assert.equal(isIsoDate('2026-02-29'), false);
  assert.equal(isIsoDate('2026-13-01'), false);
  assert.equal(isIsoDate('2026-3-14'), false);
  assert.equal(isIsoDate('14 March 2026'), false);
  assert.equal(isIsoDate(20260314), false);
});

test('monthOf cuts the year and month out of a date', () => {
  assert.equal(monthOf('2026-03-14'), '2026-03');
  assert.throws(() => monthOf('March'), /not a date/);
});

test('daysBetween counts whole days in either direction', () => {
  assert.equal(daysBetween('2026-03-01', '2026-03-15'), 14);
  assert.equal(daysBetween('2026-03-15', '2026-03-01'), -14);
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
  assert.equal(daysBetween('2026-05-05', '2026-05-05'), 0);
  assert.throws(() => daysBetween('2026-03-01', 'soon'), /not a date/);
});

test('nextId starts at one for an empty table', () => {
  assert.equal(nextId([], 'ord'), 'ord-0001');
});

test('nextId follows the highest counter, not the row count', () => {
  const rows = [{ id: 'ord-0003' }, { id: 'ord-0010' }, { id: 'ord-0002' }];
  assert.equal(nextId(rows, 'ord'), 'ord-0011');
});

test('nextId ignores other prefixes and ids that are not counters', () => {
  const rows = [{ id: 'cus-0099' }, { id: 'ord-0004' }, { id: 'ord-draft' }, { id: 'ordinary-0500' }];
  assert.equal(nextId(rows, 'ord'), 'ord-0005');
});

test('nextId pads to the width and grows past it', () => {
  assert.equal(nextId([{ id: 'box-07' }], 'box', 2), 'box-08');
  assert.equal(nextId([{ id: 'box-99' }], 'box', 2), 'box-100');
});

test('nextId continues the seeded orders', async () => {
  const database = await freshDatabase();
  assert.equal(nextId(database.tables.orders.rows, 'ord'), 'ord-0016');
  assert.equal(nextId(database.tables.products.rows, 'prd'), 'prd-0011');
});
