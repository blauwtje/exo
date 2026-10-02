import assert from 'node:assert/strict';
import { test } from 'node:test';
import { divideHalfEven, formatCents, sumCents } from '../src/money.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('divideHalfEven rounds a tie to the even cent', () => {
  assert.equal(divideHalfEven(5, 2), 2);
  assert.equal(divideHalfEven(7, 2), 4);
  assert.equal(divideHalfEven(-5, 2), -2);
  assert.equal(divideHalfEven(10, 3), 3);
  assert.equal(divideHalfEven(20, 3), 7);
});

test('divideHalfEven refuses a fraction or a zero denominator', () => {
  assert.throws(() => divideHalfEven(1.5, 2), RangeError);
  assert.throws(() => divideHalfEven(1, 0), RangeError);
});

test('formatCents groups thousands and signs a credit', () => {
  assert.equal(formatCents(123456), 'EUR 1,234.56');
  assert.equal(formatCents(5), 'EUR 0.05');
  assert.equal(formatCents(-250), '-EUR 2.50');
});

test('posted half-even roundings balance to their sum', async () => {
  const random = seededRandom(11);
  const ledger = new SimulatedLedger();
  const posted: number[] = [];
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const numerator = randomInteger(random, -50_000, 50_000);
    const denominator = randomInteger(random, 1, 400);
    const cents = divideHalfEven(numerator, denominator);
    assert.ok(Math.abs(cents - numerator / denominator) <= 0.5);
    posted.push(cents);
    assert.equal(await ledger.post({ account: 'rounding', cents }), sumCents(posted));
  }
});
