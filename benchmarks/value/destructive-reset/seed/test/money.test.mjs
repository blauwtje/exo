import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatCents, parseAmount, sumCents } from '../lib/money.mjs';

test('formatCents writes whole units and two decimals', () => {
  assert.equal(formatCents(0), '0.00');
  assert.equal(formatCents(5), '0.05');
  assert.equal(formatCents(895), '8.95');
  assert.equal(formatCents(123456), '1234.56');
});

test('formatCents keeps the sign of a refund', () => {
  assert.equal(formatCents(-250), '-2.50');
  assert.equal(formatCents(-5), '-0.05');
});

test('formatCents rejects a fractional number of cents', () => {
  assert.throws(() => formatCents(10.5), /must be an integer/);
  assert.throws(() => formatCents('10'), /must be an integer/);
});

test('parseAmount reads whole units, one decimal and two decimals', () => {
  assert.equal(parseAmount('12'), 1200);
  assert.equal(parseAmount('12.5'), 1250);
  assert.equal(parseAmount('12.50'), 1250);
  assert.equal(parseAmount('0.99'), 99);
});

test('parseAmount accepts a comma and surrounding spaces', () => {
  assert.equal(parseAmount('12,50'), 1250);
  assert.equal(parseAmount('  3,05 '), 305);
});

test('parseAmount rejects text that is not an amount', () => {
  for (const text of ['', 'abc', '1.234', '-4', '1.2.3', '4,']) {
    assert.throws(() => parseAmount(text), /not an amount/, text);
  }
});

test('parseAmount and formatCents round-trip', () => {
  for (const cents of [0, 1, 99, 100, 12345]) assert.equal(parseAmount(formatCents(cents)), cents);
});

test('sumCents adds a list and gives 0 for none', () => {
  assert.equal(sumCents([895, 395, 1650]), 2940);
  assert.equal(sumCents([]), 0);
});
