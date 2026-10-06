// npm run dev: a small read-only JSON API over the database file.

import http from 'node:http';
import { listOrders, STATUSES } from '../lib/orders.mjs';
import { revenueByMonth, statusCounts, topCustomers } from '../lib/reports.mjs';
import { loadDatabase } from '../lib/store.mjs';

const port = Number(process.env.PORT ?? 3000);

function send(response, status, body) {
  response.writeHead(status, { 'content-type': 'application/json' });
  response.end(`${JSON.stringify(body, null, 2)}\n`);
}

function route(url, database) {
  if (url.pathname === '/orders') {
    const status = url.searchParams.get('status') ?? undefined;
    if (status && !STATUSES.includes(status)) return [400, { error: `unknown status ${status}` }];
    return [200, listOrders(database, { status })];
  }
  if (url.pathname === '/report') {
    return [200, { revenue: revenueByMonth(database), top: topCustomers(database), orders: statusCounts(database) }];
  }
  return [404, { error: 'not found' }];
}

const server = http.createServer((request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
    const [status, body] = route(url, loadDatabase());
    send(response, status, body);
  } catch (error) {
    send(response, 500, { error: error.message });
  }
});

server.listen(port, () => console.log(`orderdesk listening on http://localhost:${port}`));
