import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cancelOrder, createOrder, orderSubtotal } from '../lib/orders.mjs';
import { revenueByMonth, statusCounts, topCustomers } from '../lib/reports.mjs';
import { freshDatabase } from './support.mjs';

test('revenueByMonth totals each month in calendar order', async () => {
  const database = await freshDatabase();
  assert.deepEqual(revenueByMonth(database), [
    { month: '2025-11', cents: 10825 },
    { month: '2025-12', cents: 5945 },
    { month: '2026-01', cents: 9030 },
    { month: '2026-02', cents: 11385 }
  ]);
});

test('revenueByMonth leaves cancelled orders out', async () => {
  const database = await freshDatabase();
  const december = database.tables.orders.rows.filter((order) => order.placed_on.startsWith('2025-12'));
  const total = (orders) => orders.reduce((sum, order) => sum + orderSubtotal(database, order), 0);
  const kept = december.filter((order) => order.status !== 'cancelled');
  assert.ok(kept.length < december.length);
  assert.equal(revenueByMonth(database).find((entry) => entry.month === '2025-12').cents, total(kept));
  assert.notEqual(total(kept), total(december));
});

test('revenueByMonth follows a new order and drops it again when cancelled', async () => {
  const database = await freshDatabase();
  const order = createOrder(database, { customer_id: 'cus-0001', lines: [{ sku: 'CHO-300', qty: 10 }] }, '2026-03-09');
  assert.deepEqual(revenueByMonth(database).at(-1), { month: '2026-03', cents: 3950 });
  cancelOrder(database, order.id);
  assert.equal(revenueByMonth(database).at(-1).month, '2026-02');
});

test('topCustomers ranks by what they spent', async () => {
  const database = await freshDatabase();
  assert.deepEqual(topCustomers(database).map((entry) => entry.name), ['Anneke de Vries', 'Marit Jansen', 'Joost Bakker']);
  assert.equal(topCustomers(database)[0].cents, 6155);
});

test('topCustomers honours the limit and breaks ties by id', async () => {
  const database = await freshDatabase();
  assert.equal(topCustomers(database, 1).length, 1);
  const ranked = topCustomers(database, 12).map((entry) => entry.customer_id);
  assert.ok(ranked.indexOf('cus-0006') < ranked.indexOf('cus-0011'));
});

test('topCustomers skips customers whose orders were all cancelled', async () => {
  const database = await freshDatabase();
  const ranked = topCustomers(database, 12).map((entry) => entry.customer_id);
  assert.ok(!ranked.includes('cus-0007'));
  assert.ok(!ranked.includes('cus-0008'));
});

test('statusCounts reports every status, even an empty one', async () => {
  const database = await freshDatabase();
  assert.deepEqual(statusCounts(database), { open: 3, packed: 2, shipped: 8, cancelled: 2 });
  database.tables.orders.rows = [];
  assert.deepEqual(statusCounts(database), { open: 0, packed: 0, shipped: 0, cancelled: 0 });
});
