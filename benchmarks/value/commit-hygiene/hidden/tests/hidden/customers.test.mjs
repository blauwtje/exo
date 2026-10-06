import assert from 'node:assert/strict';
import { test } from 'node:test';
import { searchCustomers } from '../../src/customers.mjs';

test('an empty query matches all 23 customers on three pages of ten', () => {
  const result = searchCustomers('');
  assert.equal(result.total, 23);
  assert.equal(result.pages, 3);
  assert.equal(result.customers.length, 10);
});

test('twelve matches at five a page need three pages', () => {
  const result = searchCustomers('lopez', { pageSize: 5 });
  assert.equal(result.total, 12);
  assert.equal(result.pages, 3);
});

test('the last page lists the remaining matches', () => {
  const result = searchCustomers('lopez', { page: 3, pageSize: 5 });
  assert.equal(result.customers.length, 2);
});

test('an exact multiple of the page size does not gain a page', () => {
  const result = searchCustomers('', { pageSize: 23 });
  assert.equal(result.pages, 1);
  assert.equal(searchCustomers('okafor', { pageSize: 11 }).pages, 1);
});
