import { snapshotLines } from './snapshot.mjs';

export function createOrderStore(records, now) {
  const orders = new Map(records.map((order) => [order.id, { ...order, lines: snapshotLines(order.lines) }]));
  let sequence = Math.max(1000, ...records.map((order) => Number(order.id.slice(2))));

  return {
    get: (id) => orders.get(id) ?? null,
    place({ userId, lines }) {
      sequence += 1;
      const order = { id: `o-${sequence}`, userId, status: 'placed', placedAt: now(), lines: snapshotLines(lines) };
      orders.set(order.id, order);
      return order;
    },
  };
}

export const orderTotal = (order) => order.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
