// Orders: creation with stock handling, the status lifecycle and listing.

import { isIsoDate, today } from './dates.mjs';
import { nextId } from './ids.mjs';
import { sumCents } from './money.mjs';
import { adjustStock, findBySku, priceOf } from './products.mjs';
import { findRow, getTable, insertRow } from './tables.mjs';

export const STATUSES = ['open', 'packed', 'shipped', 'cancelled'];

const TRANSITIONS = {
  open: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],
  shipped: [],
  cancelled: []
};

export function orderSubtotal(database, order) {
  return sumCents(order.lines.map((line) => line.qty * priceOf(database, line.sku)));
}

function requestedBySku(lines) {
  const wanted = new Map();
  for (const line of lines) wanted.set(line.sku, (wanted.get(line.sku) ?? 0) + line.qty);
  return wanted;
}

function validateLines(database, lines) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('an order needs at least one line');
  for (const line of lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) throw new Error(`bad quantity for ${line.sku}: ${line.qty}`);
    if (!findBySku(database, line.sku)) throw new Error(`unknown sku ${line.sku}`);
  }
  for (const [sku, qty] of requestedBySku(lines)) {
    const product = findBySku(database, sku);
    if (product.stock < qty) throw new Error(`not enough stock for ${sku}: ${product.stock} left, ${qty} wanted`);
  }
}

export function createOrder(database, { customer_id, lines, note = '' }, placedOn = today()) {
  if (!findRow(database, 'customers', customer_id)) throw new Error(`unknown customer ${customer_id}`);
  if (!isIsoDate(placedOn)) throw new Error(`not a date: ${placedOn}`);
  validateLines(database, lines);
  for (const [sku, qty] of requestedBySku(lines)) adjustStock(database, sku, -qty);
  const orders = getTable(database, 'orders');
  return insertRow(database, 'orders', {
    id: nextId(orders.rows, 'ord'),
    customer_id,
    placed_on: placedOn,
    lines: lines.map(({ sku, qty }) => ({ sku, qty })),
    note,
    status: 'open'
  });
}

export function setStatus(database, id, status) {
  const order = findRow(database, 'orders', id);
  if (!order) throw new Error(`unknown order ${id}`);
  if (!STATUSES.includes(status)) throw new Error(`unknown status ${status}`);
  if (!TRANSITIONS[order.status].includes(status)) {
    throw new Error(`order ${id} cannot go from ${order.status} to ${status}`);
  }
  order.status = status;
  return order;
}

// A cancelled order puts its goods back on the shelf.
export function cancelOrder(database, id) {
  const order = setStatus(database, id, 'cancelled');
  for (const [sku, qty] of requestedBySku(order.lines)) adjustStock(database, sku, qty);
  return order;
}

export function listOrders(database, { status, customerId } = {}) {
  return getTable(database, 'orders').rows
    .filter((order) => !status || order.status === status)
    .filter((order) => !customerId || order.customer_id === customerId)
    .sort((a, b) => a.placed_on.localeCompare(b.placed_on) || a.id.localeCompare(b.id));
}
