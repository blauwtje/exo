import assert from 'node:assert/strict';
import { test } from 'node:test';
import { peakNotice } from '../lib/deepseek-peak.mjs';

const WINDOWS = { days: [1, 2, 3, 4, 5], hoursUtc: [[1, 4], [6, 10]] };
const at = (iso) => Date.parse(iso);

test('a weekday morning inside a window is peak and ends at the window close', () => {
  assert.equal(peakNotice(at('2026-11-09T07:30:00Z'), WINDOWS), 'notice: DeepSeek peak hours bill double; off-peak starts at 2026-11-09T10:00:00.000Z.');
});

test('a weekday time between windows is off-peak', () => {
  assert.equal(peakNotice(at('2026-11-09T05:00:00Z'), WINDOWS), null);
});

test('a weekend time is off-peak', () => {
  assert.equal(peakNotice(at('2026-11-08T07:00:00Z'), WINDOWS), null);
});

test('windows that cover every hour of every day give no off-peak time', () => {
  const always = { days: [0, 1, 2, 3, 4, 5, 6], hoursUtc: [[0, 24]] };
  assert.equal(peakNotice(at('2026-11-09T07:00:00Z'), always), 'notice: DeepSeek peak hours bill double; no off-peak hour is configured.');
});

test('the notice names the next off-peak time at peak and is null otherwise', () => {
  assert.match(peakNotice(at('2026-11-09T07:30:00Z'), WINDOWS), /bill double.*2026-11-09T10:00:00.000Z/);
  assert.equal(peakNotice(at('2026-11-09T05:00:00Z'), WINDOWS), null);
});
