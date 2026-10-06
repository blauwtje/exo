import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveOptions } from '../src/config/options.mjs';
import { listPrice } from '../src/catalog/price-list.mjs';
import { handle } from '../src/http/router.mjs';
import { creditNote } from '../src/invoices/credit-notes.mjs';
import { priceCart } from '../src/pricing/engine.mjs';
import { createQuote } from '../src/quotes/builder.mjs';
import { registerTenant } from '../src/tenants/registry.mjs';

const acme = registerTenant({ id: 'acme', currency: 'USD', region: 'US' });
const globex = registerTenant({ id: 'globex', currency: 'EUR', region: 'DE', priceList: { 'GADGET-2': 4500 }, options: { quoteTtlDays: 30 } });
const hooli = registerTenant({ id: 'hooli', currency: 'USD', region: 'US', priceList: { 'GADGET-2': 3900 }, options: { maxLines: 3 } });
const initech = registerTenant({ id: 'initech', currency: 'GBP', region: 'GB', rounding: 'floor' });
const NOW = new Date('2026-03-02T09:00:00.000Z');
const gadget = [{ sku: 'GADGET-2', quantity: 1 }];
const invoice = { number: 'ACME-0001', total: 1005, currency: 'USD' };

test('a price override of one tenant never reaches another', () => {
  assert.equal(listPrice(globex, 'GADGET-2'), 4500);
  assert.equal(listPrice(acme, 'GADGET-2'), 4000);
  assert.equal(listPrice(hooli, 'GADGET-2'), 3900);
  assert.equal(listPrice(globex, 'GADGET-2'), 4500);
});

test('a cart is priced from its own tenant price list after another tenant priced it', () => {
  assert.equal(priceCart(globex, gadget).subtotal, 4500);
  assert.equal(priceCart(acme, gadget).subtotal, 4000);
});

test('options of one tenant do not become the defaults of the next', () => {
  assert.equal(resolveOptions(globex).quoteTtlDays, 30);
  assert.equal(resolveOptions(hooli).maxLines, 3);
  const plain = resolveOptions(acme);
  assert.equal(plain.quoteTtlDays, 14);
  assert.equal(plain.maxLines, 25);
});

test('a caller changing resolved options does not change later results', () => {
  const options = resolveOptions(acme);
  try { options.maxLines = 1; } catch {}
  try { options.quoteTtlDays = 1; } catch {}
  assert.equal(resolveOptions(acme).maxLines, 25);
  assert.equal(resolveOptions(acme).quoteTtlDays, 14);
});

test('quote lifetimes follow the quoting tenant', () => {
  assert.equal(createQuote(globex, gadget, { now: NOW }).expiresAt, '2026-04-01T09:00:00.000Z');
  assert.equal(createQuote(acme, gadget, { now: NOW }).expiresAt, '2026-03-16T09:00:00.000Z');
});

test('the rounding mode of one tenant does not reach a credit note of another', () => {
  priceCart(initech, [{ sku: 'CABLE-1', quantity: 3 }]);
  assert.equal(creditNote(acme, invoice, { share: 0.5 }).amount, 503);
  priceCart(acme, [{ sku: 'CABLE-1', quantity: 3 }]);
  assert.equal(priceCart(initech, [{ sku: 'CABLE-2', quantity: 1 }]).tax, 95);
});

test('interleaved requests of three tenants stay apart', () => {
  const as = (tenant) => ({ 'x-tenant': tenant });
  const price = (tenant) => handle({ method: 'GET', path: '/prices/GADGET-2', headers: as(tenant) }).body.price;
  const quote = (tenant) => handle({ method: 'POST', path: '/quotes', headers: as(tenant), body: { items: [{ sku: 'CABLE-2', quantity: 1 }] } });
  assert.deepEqual([price('globex'), price('acme'), price('hooli')], [4500, 4000, 3900]);
  const first = quote('initech');
  const second = quote('acme');
  assert.equal(second.body.total - second.body.subtotal, second.body.tax);
  assert.equal(handle({ method: 'POST', path: '/credit-notes', headers: as('acme'), body: { invoice, share: 0.5 } }).body.amount, 503);
  assert.equal(first.status, 201);
});
