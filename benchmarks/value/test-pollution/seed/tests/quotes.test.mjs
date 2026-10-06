import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { createQuote, isExpired } from '../src/quotes/builder.mjs';
import { getQuote } from '../src/quotes/store.mjs';
import { eventsFor } from '../src/audit/trail.mjs';
import { fixtureTenants, NOW } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

const items = [{ sku: 'WIDGET-2', quantity: 2 }, { sku: 'CABLE-2', quantity: 4 }];

test('a quote carries the cart totals', () => {
  const quote = createQuote(tenants.acme, items, { now: NOW });
  assert.deepEqual([quote.subtotal, quote.tax, quote.total], [5600, 448, 6048]);
});

test('a quote expires after the default lifetime', () => {
  const quote = createQuote(tenants.acme, items, { now: NOW });
  assert.equal(quote.expiresAt, '2026-03-16T09:00:00.000Z');
});

test('a saved quote is found again by its tenant only', () => {
  const quote = createQuote(tenants.acme, items, { now: NOW });
  assert.equal(getQuote(tenants.acme, quote.id).total, quote.total);
  assert.throws(() => getQuote(tenants.initech, quote.id), /unknown quote/);
});

test('creating a quote is audited for its tenant', () => {
  const quote = createQuote(tenants.acme, items, { now: NOW });
  assert.ok(eventsFor('acme').some((event) => event.ref === quote.id && event.type === 'quote.created'));
});

test('a quote is expired once its date has passed', () => {
  const quote = { expiresAt: '2026-03-16T09:00:00.000Z' };
  assert.equal(isExpired(quote, new Date('2026-03-10T00:00:00Z')), false);
  assert.equal(isExpired(quote, new Date('2026-03-17T00:00:00Z')), true);
});
