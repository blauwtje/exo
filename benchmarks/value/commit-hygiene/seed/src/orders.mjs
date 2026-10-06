import { ORDERS } from './data/orders.mjs';
import { paginate } from './lib/paginate.mjs';

export function listOrders({ status, page = 1, pageSize = 10 } = {}) {
  const matching = status ? ORDERS.filter((order) => order.status === status) : ORDERS;
  return paginate(matching, page, pageSize);
}
