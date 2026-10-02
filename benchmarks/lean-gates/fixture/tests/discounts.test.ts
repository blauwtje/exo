import assert from 'node:assert/strict';
import { test } from 'node:test';
import { discountCents } from '../src/discounts.ts';
import { PROPERTY_CASES, SimulatedLedger, randomInteger, seededRandom } from './support/ledger.ts';

test('a percent discount rounds half to even', () => {
  assert.equal(discountCents(1000, { kind: 'percent', basisPoints: 1000 }), 100);
  assert.equal(discountCents(25, { kind: 'percent', basisPoints: 1000 }), 2);
  assert.equal(discountCents(35, { kind: 'percent', basisPoints: 1000 }), 4);
});

test('a fixed discount never exceeds the subtotal', () => {
  assert.equal(discountCents(500, { kind: 'fixed', cents: 800 }), 500);
  assert.equal(discountCents(500, undefined), 0);
});

test('posted discounts stay between zero and the subtotal', async () => {
  const random = seededRandom(37);
  const ledger = new SimulatedLedger();
  let expected = 0;
  for (let round = 0; round < PROPERTY_CASES; round += 1) {
    const subtotal = randomInteger(random, 0, 200_000);
    const discount = random() < 0.5
      ? { kind: 'percent', basisPoints: randomInteger(random, 0, 10_000) } as const
      : { kind: 'fixed', cents: randomInteger(random, 0, 250_000) } as const;
    const cents = discountCents(subtotal, discount);
    assert.ok(cents >= 0 && cents <= subtotal);
    expected += cents;
    assert.equal(await ledger.post({ account: 'discounts', cents }), expected);
  }
});
