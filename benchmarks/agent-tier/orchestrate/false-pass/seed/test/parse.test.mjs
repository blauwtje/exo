import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount } from '../src/parse.mjs';

test('parseAmount reads a number', () => {
  assert.equal(parseAmount(' 12.5 '), 12.5);
});

test('parseAmount refuses text', () => {
  assert.throws(() => parseAmount('twelve'), TypeError);
});

test('parseAmount refuses a negative amount', () => {
  assert.throws(() => parseAmount('-4'), RangeError);
});
