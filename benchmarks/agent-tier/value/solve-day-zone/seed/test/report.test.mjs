import assert from 'node:assert/strict';
import test from 'node:test';
import { addDays, daysBetween } from '../src/dates.mjs';
import { dailyTotals, weeklyDates } from '../src/report.mjs';

test('dailyTotals groups orders by day', () => {
  const totals = dailyTotals([
    { placedAt: '2026-03-01T10:00:00Z', amountMinor: 100 },
    { placedAt: '2026-03-01T12:00:00Z', amountMinor: 250 },
    { placedAt: '2026-03-02T09:00:00Z', amountMinor: 75 }
  ]);
  assert.deepEqual(totals, { '2026-03-01': 350, '2026-03-02': 75 });
});

test('weeklyDates steps seven days', () => {
  assert.deepEqual(weeklyDates('2026-03-02', 3), ['2026-03-02', '2026-03-09', '2026-03-16']);
});

test('addDays and daysBetween agree', () => {
  assert.equal(addDays('2026-02-27', 3), '2026-03-02');
  assert.equal(daysBetween('2026-02-27', '2026-03-02'), 3);
});
