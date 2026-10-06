import assert from 'node:assert/strict';
import test from 'node:test';
import { lateFee, shippingFee } from '../src/fees.mjs';
import { order } from './fixtures.mjs';

test('shipping is 3.5% of the subtotal', () => {
  assert.equal(shippingFee(order), 142);
});

test('late fee is 1.5% per started 30 days', () => {
  assert.equal(lateFee(10000, 10), 150);
  assert.equal(lateFee(10000, 45), 300);
  assert.equal(lateFee(1999, 10), 30);
});
