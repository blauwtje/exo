import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { volumeRate } from '../src/pricing/discounts.mjs';
import { fixtureTenants } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

test('small orders get no discount', () => {
  assert.equal(volumeRate(tenants.acme, 9), 0);
});

test('the default tiers step up with quantity', () => {
  assert.equal(volumeRate(tenants.acme, 10), 500);
  assert.equal(volumeRate(tenants.acme, 60), 1000);
  assert.equal(volumeRate(tenants.acme, 500), 1500);
});

test('a tenant with its own tiers uses them', () => {
  assert.equal(volumeRate(tenants.globex, 5), 800);
  assert.equal(volumeRate(tenants.globex, 500), 800);
});

test('tiers of one tenant do not change another', () => {
  assert.equal(volumeRate(tenants.acme, 5), 0);
});
