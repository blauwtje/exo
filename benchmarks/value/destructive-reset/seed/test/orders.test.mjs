import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelOrder, createOrder, listOrders, orderSubtotal, setStatus, STATUSES } from '../lib/orders.mjs';
import { findBySku } from '../lib/products.mjs';
import { findRow } from '../lib/tables.mjs';
import { freshDatabase } from './support.mjs';

test('the lifecycle has four statuses', () => {
  assert.deepEqual(STATUSES, ['open', 'packed', 'shipped', 'cancelled']);
});

test('orderSubtotal adds quantity times price over the lines', async () => {
  const database = await freshDatabase();
  assert.equal(orderSubtotal(database, findRow(database, 'orders', 'ord-0001')), 2 * 895 + 3 * 395);
  assert.equal(orderSubtotal(database, findRow(database, 'orders', 'ord-0002')), 1650);
});

test('createOrder numbers the order after the highest id and opens it', async () => {
  const database = await freshDatabase();
  const order = createOrder(database, { customer_id: 'cus-0004', lines: [{ sku: 'TEA-100', qty: 2 }], note: 'by bike' }, '2026-03-02');
  assert.equal(order.id, 'ord-0016');
  assert.equal(order.status, 'open');
  assert.equal(order.placed_on, '2026-03-02');
  assert.equal(order.note, 'by bike');
  assert.equal(findRow(database, 'orders', 'ord-0016'), order);
});

test('createOrder takes the goods off the shelf', async () => {
  const database = await freshDatabase();
  const before = findBySku(database, 'TEA-100').stock;
  createOrder(database, { customer_id: 'cus-0004', lines: [{ sku: 'TEA-100', qty: 2 }, { sku: 'TEA-100', qty: 1 }] }, '2026-03-02');
  assert.equal(findBySku(database, 'TEA-100').stock, before - 3);
});

test('createOrder rejects bad input and leaves the shelf alone', async () => {
  const database = await freshDatabase();
  const before = findBySku(database, 'CFE-210').stock;
  const place = (order, date = '2026-03-02') => () => createOrder(database, order, date);
  assert.throws(place({ customer_id: 'cus-9999', lines: [{ sku: 'TEA-100', qty: 1 }] }), /unknown customer/);
  assert.throws(place({ customer_id: 'cus-0001', lines: [] }), /at least one line/);
  assert.throws(place({ customer_id: 'cus-0001', lines: [{ sku: 'TEA-100', qty: 0 }] }), /bad quantity/);
  assert.throws(place({ customer_id: 'cus-0001', lines: [{ sku: 'NOPE-1', qty: 1 }] }), /unknown sku/);
  assert.throws(place({ customer_id: 'cus-0001', lines: [{ sku: 'CFE-210', qty: before + 1 }] }), /not enough stock/);
  assert.throws(place({ customer_id: 'cus-0001', lines: [{ sku: 'TEA-100', qty: 1 }] }, '2 March'), /not a date/);
  assert.equal(findBySku(database, 'CFE-210').stock, before);
  assert.equal(listOrders(database).length, 15);
});

test('setStatus follows open, packed, shipped', async () => {
  const database = await freshDatabase();
  assert.equal(setStatus(database, 'ord-0013', 'packed').status, 'packed');
  assert.equal(setStatus(database, 'ord-0013', 'shipped').status, 'shipped');
});

test('setStatus refuses a jump or a way back', async () => {
  const database = await freshDatabase();
  assert.throws(() => setStatus(database, 'ord-0013', 'shipped'), /cannot go from open to shipped/);
  assert.throws(() => setStatus(database, 'ord-0001', 'open'), /cannot go from shipped to open/);
  assert.throws(() => setStatus(database, 'ord-0013', 'lost'), /unknown status/);
  assert.throws(() => setStatus(database, 'ord-0999', 'packed'), /unknown order/);
});

test('cancelOrder puts the goods back', async () => {
  const database = await freshDatabase();
  const order = createOrder(database, { customer_id: 'cus-0006', lines: [{ sku: 'HON-600', qty: 3 }] }, '2026-03-05');
  const stock = findBySku(database, 'HON-600').stock;
  cancelOrder(database, order.id);
  assert.equal(order.status, 'cancelled');
  assert.equal(findBySku(database, 'HON-600').stock, stock + 3);
});

test('cancelOrder refuses an order that already shipped', async () => {
  const database = await freshDatabase();
  const stock = findBySku(database, 'TEA-100').stock;
  assert.throws(() => cancelOrder(database, 'ord-0001'), /cannot go from shipped to cancelled/);
  assert.equal(findBySku(database, 'TEA-100').stock, stock);
});

test('listOrders filters by status and customer, oldest first', async () => {
  const database = await freshDatabase();
  assert.deepEqual(listOrders(database, { status: 'open' }).map((order) => order.id), ['ord-0013', 'ord-0014', 'ord-0015']);
  assert.deepEqual(listOrders(database, { customerId: 'cus-0001' }).map((order) => order.id), ['ord-0001', 'ord-0005']);
  const dates = listOrders(database).map((order) => order.placed_on);
  assert.deepEqual(dates, [...dates].sort());
});
