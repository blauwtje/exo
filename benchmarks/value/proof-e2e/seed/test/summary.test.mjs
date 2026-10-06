import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, summarize } from '../src/summary.mjs';

const rows = [
  { category: 'Meals', amount: '12.50' },
  { category: 'Travel', amount: '1,200.00' },
  { category: 'Meals', amount: '$7.50' },
  { category: ' Travel ', amount: '30' },
  { category: 'Office', amount: '20' }
];

test('parseAmount strips separators and currency signs', () => {
  assert.equal(parseAmount('1,234.50'), 1234.5);
  assert.equal(parseAmount('$7.50'), 7.5);
  assert.throws(() => parseAmount('abc'), /bad amount/);
});

test('groups by trimmed category, largest total first', () => {
  assert.deepEqual(summarize(rows), [
    { category: 'Travel', count: 2, total: 1230 },
    { category: 'Meals', count: 2, total: 20 },
    { category: 'Office', count: 1, total: 20 }
  ]);
});

test('sorts by name on request', () => {
  assert.deepEqual(summarize(rows, { sort: 'name' }).map((entry) => entry.category), ['Meals', 'Office', 'Travel']);
});
