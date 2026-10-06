import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dedupe } from '../src/export/dedupe.mjs';

const row = (source, id, amountMinor = 1000) => ({ source, id, amountMinor });

test('a redelivered row counts once', () => {
  const rows = [row('cardsvc', '10'), row('cardsvc', '11'), row('cardsvc', '10')];
  assert.deepEqual(dedupe(rows).map((kept) => kept.id), ['10', '11']);
});

test('the first row wins and the order is kept', () => {
  const rows = [row('ledger', '5', 100), row('ledger', '3', 200), row('ledger', '5', 100)];
  assert.deepEqual(dedupe(rows).map((kept) => [kept.id, kept.amountMinor]), [['5', 100], ['3', 200]]);
});

test('distinct rows from both sources all stay', () => {
  const rows = [row('cardsvc', '10'), row('ledger', '20'), row('cardsvc', '11'), row('ledger', '21')];
  assert.equal(dedupe(rows).length, 4);
});

test('the input array is not modified', () => {
  const rows = [row('cardsvc', '1'), row('cardsvc', '1')];
  dedupe(rows);
  assert.equal(rows.length, 2);
});
