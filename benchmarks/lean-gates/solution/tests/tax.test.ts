import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTax, taxRate } from '../src/tax.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('taxRate reads the rate of a region and category', () => {
  assert.equal(taxRate('NL', 'standard', '2024-03-01'), 2100);
  assert.equal(taxRate('DE', 'reduced', '2024-03-01'), 700);
  assert.equal(taxRate('BE', 'zero', '2024-03-01'), 0);
});

test('computeTax rounds half to even', () => {
  assert.equal(computeTax(1000, 'NL', 'standard', '2024-03-01'), 210);
  assert.equal(computeTax(50, 'DE', 'reduced', '2024-03-01'), 4);
  assert.equal(computeTax(150, 'DE', 'reduced', '2024-03-01'), 10);
});

test('the rate in force on the date applies', () => {
  assert.equal(taxRate('DE', 'standard', '2020-06-30'), 1900);
  assert.equal(taxRate('DE', 'standard', '2020-07-01'), 1600);
  assert.equal(taxRate('DE', 'reduced', '2020-12-31'), 500);
  assert.equal(taxRate('DE', 'standard', '2021-01-01'), 1900);
  assert.equal(taxRate('NL', 'reduced', '2018-12-31'), 600);
  assert.equal(taxRate('NL', 'reduced', '2019-01-01'), 900);
  assert.equal(computeTax(10_000, 'DE', 'standard', '2020-09-15'), 1600);
});

test('posted tax on a split amount stays within a cent per part of the whole', async () => {
  const random = seededRandom(41);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const whole = randomInteger(random, 2, 100_000);
    const part = randomInteger(random, 1, whole - 1);
    const split = computeTax(part, 'NL', 'standard', '2024-03-01') + computeTax(whole - part, 'NL', 'standard', '2024-03-01');
    assert.ok(Math.abs(split - computeTax(whole, 'NL', 'standard', '2024-03-01')) <= 1);
    expected += split;
    assert.equal(await ledger.post({ account: 'tax', cents: split }), expected);
  }
});
