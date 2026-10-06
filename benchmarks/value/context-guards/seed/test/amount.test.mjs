import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAmount } from '../src/amount.mjs';

test('parses plain decimals', () => {
  assert.equal(parseAmount('12.50'), 12.5);
  assert.equal(parseAmount(' 7 '), 7);
});

test('a leading minus is a refund', () => {
  assert.equal(parseAmount('-35.00'), -35);
});

test('text that is not a number is null', () => {
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseAmount(''), null);
});
