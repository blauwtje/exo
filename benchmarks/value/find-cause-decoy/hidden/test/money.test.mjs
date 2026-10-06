import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoney, percentOf, roundMoney } from '../src/money.mjs';
import { currentMode, withRounding } from '../src/rounding.mjs';

test('roundMoney rounds half-up by default', () => {
  assert.equal(roundMoney(4127.4), 4127);
  assert.equal(roundMoney(4127.5), 4128);
  assert.equal(roundMoney(4127.6), 4128);
  assert.equal(roundMoney(4127), 4127);
});

test('roundMoney follows the mode set by withRounding', () => {
  assert.equal(withRounding('floor', () => roundMoney(4127.9)), 4127);
  assert.equal(withRounding('ceil', () => roundMoney(4127.1)), 4128);
});

test('withRounding returns the callback result and restores the previous mode', () => {
  assert.equal(withRounding('ceil', () => 'done'), 'done');
  assert.equal(currentMode(), 'half-up');
});

test('withRounding nests', () => {
  withRounding('floor', () => {
    withRounding('ceil', () => assert.equal(currentMode(), 'ceil'));
    assert.equal(currentMode(), 'floor');
  });
  assert.equal(currentMode(), 'half-up');
});

test('withRounding rejects an unknown mode', () => {
  assert.throws(() => withRounding('banker', () => 1), RangeError);
  assert.equal(currentMode(), 'half-up');
});

test('percentOf rounds the share to whole cents', () => {
  assert.equal(percentOf(4045, 825), 334);
  assert.equal(percentOf(1000, 1000), 100);
});

test('formatMoney prints dollars and cents', () => {
  assert.equal(formatMoney(4379), '43.79');
  assert.equal(formatMoney(5), '0.05');
});
