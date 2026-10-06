#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { listOrders } from '../src/orders.mjs';
import { formatCents, pageFooter } from '../src/lib/format.mjs';

const { values } = parseArgs({
  options: {
    status: { type: 'string' },
    page: { type: 'string', default: '1' },
    'page-size': { type: 'string', default: '10' },
  },
});

const result = listOrders({
  status: values.status,
  page: Number(values.page),
  pageSize: Number(values['page-size']),
});

for (const order of result.items) {
  console.log(`#${order.id}  ${order.status.padEnd(9)} ${formatCents(order.totalCents)}`);
}
console.log(pageFooter(result));
if (result.hasNext) console.log('More orders on the next page.');
