import assert from 'node:assert/strict';
import { test } from 'node:test';
import { keepBillable } from '../src/export/filters.mjs';

const row = (id, overrides) => ({ id, status: 'settled', amountMinor: 1000, amountEur: 900, ...overrides });

test('settled rows are kept', () => {
  assert.deepEqual(keepBillable([row('1'), row('2')]).map((kept) => kept.id), ['1', '2']);
});

test('failed, pending and void rows are dropped', () => {
  const rows = [row('1', { status: 'failed' }), row('2', { status: 'pending' }), row('3', { status: 'void' }), row('4')];
  assert.deepEqual(keepBillable(rows).map((kept) => kept.id), ['4']);
});

test('settled refunds and credit notes are kept', () => {
  const rows = [row('1', { amountMinor: -500, amountEur: -450 }), row('2', { status: 'failed', amountMinor: -700 })];
  assert.deepEqual(keepBillable(rows).map((kept) => kept.id), ['1']);
});

test('empty input stays empty', () => {
  assert.deepEqual(keepBillable([]), []);
});
