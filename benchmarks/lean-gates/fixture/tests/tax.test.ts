import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeTax, taxRate } from '../src/tax.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('taxRate reads the rate of a region and category', () => {
  assert.equal(taxRate('NL', 'standard'), 2100);
  assert.equal(taxRate('DE', 'reduced'), 700);
  assert.equal(taxRate('BE', 'zero'), 0);
});

test('computeTax rounds half to even', () => {
  assert.equal(computeTax(1000, 'NL', 'standard'), 210);
  assert.equal(computeTax(50, 'DE', 'reduced'), 4);
  assert.equal(computeTax(150, 'DE', 'reduced'), 10);
});

test('posted tax on a split amount stays within a cent per part of the whole', async () => {
  const random = seededRandom(41);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const whole = randomInteger(random, 2, 100_000);
    const part = randomInteger(random, 1, whole - 1);
    const split = computeTax(part, 'NL', 'standard') + computeTax(whole - part, 'NL', 'standard');
    assert.ok(Math.abs(split - computeTax(whole, 'NL', 'standard')) <= 1);
    expected += split;
    assert.equal(await ledger.post({ account: 'tax', cents: split }), expected);
  }
});
