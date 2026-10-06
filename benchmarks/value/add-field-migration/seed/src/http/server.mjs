import http from 'node:http';
import { AppError } from '../util/errors.mjs';
import * as accounts from './handlers/accounts.mjs';
import * as invoices from './handlers/invoices.mjs';
import { createRouter } from './router.mjs';

const match = createRouter([
  ['GET', '/invoices', invoices.list],
  ['GET', '/invoices/:id', invoices.show],
  ['POST', '/invoices', invoices.create],
  ['GET', '/accounts/:id', accounts.show],
]);

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (chunks.length === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new AppError(400, 'bad_json', 'the request body is not valid JSON');
  }
}

function send(response, status, body) {
  const text = JSON.stringify(body);
  response.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(text) });
  response.end(text);
}

export function createServer({ dbPath }) {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      const route = match(request.method, url.pathname);
      if (!route) throw new AppError(404, 'no_route', `no route for ${request.method} ${url.pathname}`);
      const body = await readJson(request);
      const result = route.handler({ dbPath, params: route.params, query: url.searchParams, body });
      send(response, result.status ?? 200, result.body);
    } catch (error) {
      if (error instanceof AppError) {
        send(response, error.status, { error: { code: error.code, message: error.message } });
      } else {
        send(response, 500, { error: { code: 'internal', message: 'something went wrong' } });
      }
    }
  });
}
