import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPrice } from '../src/format.mjs';

test('formatPrice prints whole units, two decimals and the code', () => {
  assert.equal(formatPrice(1234, 'EUR'), '12.34 EUR');
  assert.equal(formatPrice(-5, 'USD'), '-0.05 USD');
});
