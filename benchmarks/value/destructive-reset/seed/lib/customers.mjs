// Customers are found by email, compared without regard to case.

import { isIsoDate, today } from './dates.mjs';
import { nextId } from './ids.mjs';
import { getTable, insertRow } from './tables.mjs';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function findByEmail(database, email) {
  const wanted = String(email).trim().toLowerCase();
  return getTable(database, 'customers').rows.find((customer) => customer.email.toLowerCase() === wanted);
}

export function addCustomer(database, { name, email, city }, createdOn = today()) {
  if (!name || !String(name).trim()) throw new Error('a customer needs a name');
  if (!EMAIL.test(String(email).trim())) throw new Error(`not an email address: ${email}`);
  if (!isIsoDate(createdOn)) throw new Error(`not a date: ${createdOn}`);
  if (findByEmail(database, email)) throw new Error(`a customer with ${email} already exists`);
  const customers = getTable(database, 'customers');
  return insertRow(database, 'customers', {
    id: nextId(customers.rows, 'cus'),
    name: String(name).trim(),
    email: String(email).trim(),
    city: city ?? null,
    created_on: createdOn
  });
}

export function ordersOf(database, customerId) {
  return getTable(database, 'orders').rows.filter((order) => order.customer_id === customerId);
}
