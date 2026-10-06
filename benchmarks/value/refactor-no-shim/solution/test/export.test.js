import assert from 'node:assert/strict';
import test from 'node:test';
import { toCsv } from '../src/export.js';
import { Account } from '../src/models/index.js';

test('toCsv writes a header and quotes cells with commas', () => {
  const csv = toCsv([new Account({ id: 1, email: 'a@b.co', name: 'Doe, Jo' })]);
  assert.equal(csv, 'kind,id,email,name,plan\nuser,1,a@b.co,"Doe, Jo",free\n');
});

test('toCsv of nothing is empty', () => {
  assert.equal(toCsv([]), '');
});
