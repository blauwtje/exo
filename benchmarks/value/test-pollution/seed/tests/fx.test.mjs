import assert from 'node:assert/strict';
import { test } from 'node:test';
import { convert } from '../src/fx/convert.mjs';

test('the same currency is returned as is', () => {
  assert.equal(convert(1234, 'USD', 'USD'), 1234);
});

test('dollars convert to euros', () => {
  assert.equal(convert(10000, 'USD', 'EUR'), 9200);
});

test('euros convert to pounds through the dollar rate', () => {
  assert.equal(convert(9200, 'EUR', 'GBP'), 7900);
});

test('an unknown currency is refused', () => {
  assert.throws(() => convert(100, 'USD', 'XXX'), /no rate/);
});
