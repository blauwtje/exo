import assert from 'node:assert/strict';
import { before, test } from 'node:test';
import { creditNote } from '../src/invoices/credit-notes.mjs';
import { fixtureTenants } from './helpers.mjs';

let acme;
before(() => { acme = fixtureTenants().acme; });

const invoice = { number: 'ACME-0001', total: 1005, currency: 'USD' };

test('half a cent rounds up', () => {
  assert.equal(creditNote(acme, invoice, { share: 0.5 }).amount, 503);
});

test('a quarter share rounds to the nearest cent', () => {
  assert.equal(creditNote(acme, { ...invoice, total: 2010 }, { share: 0.25 }).amount, 503);
});

test('a share above one is refused', () => {
  assert.throws(() => creditNote(acme, invoice, { share: 1.5 }), /share must be/);
});
