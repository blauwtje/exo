import assert from 'node:assert/strict';
import { test } from 'node:test';
import { currencyOf } from '../src/models/account.mjs';
import { accountCurrency } from '../src/services/accounts.mjs';

const org = { id: 'org_default', defaultCurrency: 'EUR' };

test('an account with its own currency uses it', () => {
  assert.equal(currencyOf({ id: 'acc_1', currency: 'USD' }, org), 'USD');
});

test('an account without a currency uses the organisation default', () => {
  assert.equal(currencyOf({ id: 'acc_1' }, org), 'EUR');
});

test('a currency is compared in capitals', () => {
  assert.equal(currencyOf({ id: 'acc_1', currency: 'chf' }, org), 'CHF');
});

test('accountCurrency looks the organisation up through the account', () => {
  const db = {
    orgs: [org, { id: 'org_nord', defaultCurrency: 'SEK' }],
    accounts: [{ id: 'acc_1', orgId: 'org_nord' }],
  };
  assert.equal(accountCurrency(db, 'acc_1'), 'SEK');
});
