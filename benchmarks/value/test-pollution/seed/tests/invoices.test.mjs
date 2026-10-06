import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { generateInvoice } from '../src/invoices/generate.mjs';
import { fixtureTenants, NOW } from './helpers.mjs';

let tenants;
before(() => { tenants = fixtureTenants(); });

const quote = (tenant) => ({ id: 'Q-1', tenant, currency: 'USD', lines: [], total: 2500 });

test('an invoice number carries the tenant prefix', () => {
  assert.match(generateInvoice(tenants.acme, quote('acme'), { now: NOW }).number, /^ACME-\d{4}$/);
});

test('numbers of one tenant run on by one', () => {
  const first = generateInvoice(tenants.acme, quote('acme'), { now: NOW });
  const second = generateInvoice(tenants.acme, quote('acme'), { now: NOW });
  assert.equal(Number(second.number.slice(-4)), Number(first.number.slice(-4)) + 1);
});

test('an invoice is due after thirty days', () => {
  assert.equal(generateInvoice(tenants.acme, quote('acme'), { now: NOW }).dueAt, '2026-04-01T09:00:00.000Z');
});

test('a quote of another tenant is refused', () => {
  assert.throws(() => generateInvoice(tenants.acme, quote('globex'), { now: NOW }), /another tenant/);
});
