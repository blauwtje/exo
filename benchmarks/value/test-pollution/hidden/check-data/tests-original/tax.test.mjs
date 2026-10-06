import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { knownRegions, regionRateBps } from '../src/config/regions.mjs';
import { taxRate } from '../src/pricing/tax.mjs';
import { fixtureTenants } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

test('the rate follows the tenant region', () => {
  assert.equal(taxRate(tenants.acme, 'hardware'), 800);
  assert.equal(taxRate(tenants.globex, 'hardware'), 1900);
});

test('a category override beats the region rate', () => {
  assert.equal(taxRate(tenants.initech, 'digital'), 0);
  assert.equal(taxRate(tenants.initech, 'hardware'), 2000);
});

test('an unknown region is refused', () => {
  assert.throws(() => regionRateBps('ZZ'), /no tax rate/);
});

test('every known region has a rate', () => {
  for (const region of knownRegions()) assert.ok(regionRateBps(region) >= 0);
});
