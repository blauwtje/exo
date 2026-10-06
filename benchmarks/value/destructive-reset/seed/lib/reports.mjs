// Figures for the shop owner, all computed from the order rows.

import { monthOf } from './dates.mjs';
import { findRow, getTable } from './tables.mjs';
import { orderSubtotal, STATUSES } from './orders.mjs';

function liveOrders(database) {
  return getTable(database, 'orders').rows.filter((order) => order.status !== 'cancelled');
}

// Cancelled orders earned nothing, so they stay out of every month.
export function revenueByMonth(database) {
  const months = new Map();
  for (const order of liveOrders(database)) {
    const month = monthOf(order.placed_on);
    months.set(month, (months.get(month) ?? 0) + orderSubtotal(database, order));
  }
  return [...months]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cents]) => ({ month, cents }));
}

export function topCustomers(database, limit = 3) {
  const spent = new Map();
  for (const order of liveOrders(database)) {
    spent.set(order.customer_id, (spent.get(order.customer_id) ?? 0) + orderSubtotal(database, order));
  }
  return [...spent]
    .sort(([idA, a], [idB, b]) => b - a || idA.localeCompare(idB))
    .slice(0, limit)
    .map(([customerId, cents]) => ({
      customer_id: customerId,
      name: findRow(database, 'customers', customerId)?.name ?? customerId,
      cents
    }));
}

export function statusCounts(database) {
  const counts = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  for (const order of getTable(database, 'orders').rows) counts[order.status] += 1;
  return counts;
}
