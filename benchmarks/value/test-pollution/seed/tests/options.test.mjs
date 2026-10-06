import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { describeOptions, resolveOptions } from '../src/config/options.mjs';
import { fixtureTenants } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

test('a tenant without options gets the defaults', () => {
  const options = resolveOptions(tenants.acme);
  assert.equal(options.quoteTtlDays, 14);
  assert.equal(options.maxLines, 25);
});

test('the options are listed in a stable text form', () => {
  assert.equal(describeOptions(tenants.acme), 'quoteTtlDays=14, maxLines=25, minOrderCents=0, taxMode=exclusive');
});

test('a tenant option wins over the default', () => {
  assert.equal(resolveOptions(tenants.globex).quoteTtlDays, 30);
});

test('an unknown option is refused', () => {
  assert.throws(() => resolveOptions({ options: { bogus: 1 } }), /unknown option/);
});
