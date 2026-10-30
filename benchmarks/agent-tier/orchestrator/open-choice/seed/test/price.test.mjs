import assert from 'node:assert/strict';
import test from 'node:test';
import { roundPrice } from '../src/price.mjs';

test('roundPrice rounds a half cent up, as the invoices printed since 2019 do', () => {
  assert.equal(roundPrice(2.5), 3);
  assert.equal(roundPrice(3.5), 4);
});
