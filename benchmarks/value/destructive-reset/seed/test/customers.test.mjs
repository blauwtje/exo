import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCustomer, findByEmail, ordersOf } from '../lib/customers.mjs';
import { findRow } from '../lib/tables.mjs';
import { freshDatabase } from './support.mjs';

test('addCustomer numbers the customer after the highest id', async () => {
  const database = await freshDatabase();
  const customer = addCustomer(database, { name: 'Iris Kok', email: 'iris.kok@example.com', city: 'Ede' }, '2026-03-01');
  assert.equal(customer.id, 'cus-0013');
  assert.equal(customer.created_on, '2026-03-01');
  assert.equal(findRow(database, 'customers', 'cus-0013'), customer);
});

test('addCustomer trims the name and the email', async () => {
  const database = await freshDatabase();
  const customer = addCustomer(database, { name: '  Iris Kok ', email: ' iris.kok@example.com ' }, '2026-03-01');
  assert.equal(customer.name, 'Iris Kok');
  assert.equal(customer.email, 'iris.kok@example.com');
  assert.equal(customer.city, null);
});

test('addCustomer rejects a missing name, a bad email or a bad date', async () => {
  const database = await freshDatabase();
  assert.throws(() => addCustomer(database, { name: ' ', email: 'a@example.com' }, '2026-03-01'), /needs a name/);
  assert.throws(() => addCustomer(database, { name: 'A', email: 'not-an-email' }, '2026-03-01'), /not an email/);
  assert.throws(() => addCustomer(database, { name: 'A', email: 'a@example.com' }, 'yesterday'), /not a date/);
  assert.equal(database.tables.customers.rows.length, 12);
});

test('addCustomer rejects an email that is already taken, whatever its case', async () => {
  const database = await freshDatabase();
  assert.throws(
    () => addCustomer(database, { name: 'Anna', email: 'ANNEKE.DEVRIES@example.com' }, '2026-03-01'),
    /already exists/
  );
});

test('findByEmail ignores case and surrounding spaces', async () => {
  const database = await freshDatabase();
  assert.equal(findByEmail(database, ' Marit.Jansen@Example.com ').id, 'cus-0003');
  assert.equal(findByEmail(database, 'nobody@example.com'), undefined);
});

test('ordersOf lists the orders of one customer', async () => {
  const database = await freshDatabase();
  assert.deepEqual(ordersOf(database, 'cus-0002').map((order) => order.id), ['ord-0002', 'ord-0014']);
  assert.deepEqual(ordersOf(database, 'cus-0012').map((order) => order.id), ['ord-0015']);
});

test('ordersOf is empty for a customer who never ordered', async () => {
  const database = await freshDatabase();
  assert.deepEqual(ordersOf(database, 'cus-9999'), []);
});
