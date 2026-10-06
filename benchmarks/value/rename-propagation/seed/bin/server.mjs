import fs from 'node:fs';
import http from 'node:http';
import { createApp } from '../src/app.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const app = createApp({ data: Object.fromEntries(['products', 'users', 'carts', 'orders', 'wishlists'].map((name) => [name, read(name)])) });

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    let body = {};
    try {
      body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
    } catch {
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code: 'invalid_input', message: 'body is not valid JSON' } }));
      return;
    }
    const result = app.handle({ method: request.method, path: request.url, body, headers: request.headers });
    response.writeHead(result.status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(result.body));
  });
});

server.listen(Number(process.env.PORT ?? 3000));
