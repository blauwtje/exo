import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { handle } from '../src/http/router.mjs';
import { fixtureTenants } from './helpers.mjs';

before(() => { fixtureTenants(); });

const acme = { 'x-tenant': 'acme' };

test('a price is looked up for the calling tenant', () => {
  assert.deepEqual(handle({ method: 'GET', path: '/prices/WIDGET-1', headers: acme }).body, { sku: 'WIDGET-1', price: 1000 });
});

test('a quote is created and read back', () => {
  const created = handle({ method: 'POST', path: '/quotes', headers: acme, body: { items: [{ sku: 'CABLE-1', quantity: 2 }] } });
  assert.equal(created.status, 201);
  const shown = handle({ method: 'GET', path: `/quotes/${created.body.id}`, headers: acme });
  assert.equal(shown.body.total, 756);
});

test('a request without a tenant is refused', () => {
  assert.equal(handle({ method: 'GET', path: '/prices/WIDGET-1' }).status, 400);
});

test('an unknown tenant is not found', () => {
  assert.equal(handle({ method: 'GET', path: '/prices/WIDGET-1', headers: { 'x-tenant': 'nobody' } }).status, 404);
});

test('a credit note with a bad share is refused', () => {
  const response = handle({ method: 'POST', path: '/credit-notes', headers: acme, body: { invoice: { number: 'X', total: 100 }, share: 3 } });
  assert.equal(response.status, 400);
});
