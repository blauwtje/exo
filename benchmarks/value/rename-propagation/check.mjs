// Hidden check for value-rename-propagation. Builds the app from the repo's
// src/app.mjs over fixture data, renames products through the HTTP-shaped
// handle(), reads every place a name shows, then runs the repo's own npm test.
// Usage: node check.mjs <repoDir>
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repo = path.resolve(process.argv[2] ?? '.');
const read = (name) => JSON.parse(fs.readFileSync(path.join(repo, 'check-data', `${name}.json`), 'utf8'));
let createApp;
let loadError;
try {
  ({ createApp } = await import(pathToFileURL(path.join(repo, 'src', 'app.mjs')).href));
} catch (error) {
  loadError = String(error?.message ?? error).slice(0, 120);
}

function fresh() {
  let time = Date.parse('2026-03-02T09:00:00.000Z');
  const data = Object.fromEntries(['products', 'users', 'carts', 'orders', 'wishlists'].map((n) => [n, read(n)]));
  return createApp({ data, now: () => new Date((time += 1000)).toISOString() });
}
const call = (app, method, url, as, body) => app.handle({ method, path: url, body, headers: as ? { 'x-user': as } : {} });
const rename = (app, id, name, as = 'u-admin') => call(app, 'PATCH', `/products/${id}`, as, { name });
const NEW = 'Cobalt Enamel Mug';
const q = (app, text) => call(app, 'GET', `/search?q=${encodeURIComponent(text)}`).body.results ?? [];
const ids = (list) => list.map((item) => item.id);
const product = (app, id) => call(app, 'GET', `/products/${id}`).body.product;
const events = (app, id) => call(app, 'GET', `/audit?entity=product:${id}`, 'u-admin').body.events ?? [];
const keys = (value) => Object.keys(value ?? {}).sort().join(',');
const warm = (app) => {
  for (const u of ['/products', '/products?category=mugs', '/products/p1']) call(app, 'GET', u);
  for (const t of ['blue', 'blue mug', 'mug', 'cobalt']) q(app, t);
};
const cartLine = (app, cart, owner) => call(app, 'GET', `/carts/${cart}`, owner).body.cart.lines.find((l) => l.productId === 'p1');
const refError = (app, method, url, as, body) => call(app, method, url, as, body);

const cases = [
  ['an admin rename answers 200 and keeps the other fields', () => {
    const app = fresh();
    const before = product(app, 'p1');
    const r = rename(app, 'p1', NEW);
    if (![200, 204].includes(r.status)) return `status ${r.status}`;
    const after = product(app, 'p1');
    if (after.name !== NEW) return `GET /products/p1 says ${after.name}`;
    return keys({ ...after, name: 0 }) === keys({ ...before, name: 0 }) && after.price === before.price && after.stock === before.stock ? null : 'other fields changed';
  }],
  ['search finds the new name and not the old one', () => {
    const app = fresh();
    rename(app, 'p1', NEW);
    const problems = [];
    if (!ids(q(app, 'cobalt')).includes('p1')) problems.push('cobalt misses p1');
    if (ids(q(app, 'blue mug')).includes('p1')) problems.push('old name still finds p1');
    if (ids(q(app, 'blue')).join() !== 'p2') problems.push(`blue gives ${ids(q(app, 'blue'))}`);
    if (!ids(q(app, 'mug')).includes('p1')) problems.push('mug lost p1');
    return problems.join('; ') || null;
  }],
  ['cached search results do not keep the old name', () => {
    const app = fresh();
    warm(app);
    rename(app, 'p1', NEW);
    const problems = [];
    if (ids(q(app, 'blue mug')).includes('p1')) problems.push('cached old query still finds p1');
    const hit = q(app, 'mug').find((r) => r.id === 'p1');
    if (hit?.name !== NEW) problems.push(`cached mug search shows ${hit?.name}`);
    if (!ids(q(app, 'cobalt')).includes('p1')) problems.push('cached cobalt search misses p1');
    return problems.join('; ') || null;
  }],
  ['a cached product read shows the new name', () => {
    const app = fresh();
    warm(app);
    rename(app, 'p1', NEW);
    return product(app, 'p1')?.name === NEW ? null : `got ${product(app, 'p1')?.name}`;
  }],
  ['cached lists show the new name', () => {
    const app = fresh();
    warm(app);
    rename(app, 'p1', NEW);
    const problems = [];
    for (const u of ['/products', '/products?category=mugs']) {
      const list = call(app, 'GET', u).body.products;
      if (list.find((p) => p.id === 'p1')?.name !== NEW) problems.push(`${u} shows ${list.find((p) => p.id === 'p1')?.name}`);
    }
    return problems.join('; ') || null;
  }],
  ['every cart holding the product shows the new name', () => {
    const app = fresh();
    const totals = ['c-ana', 'c-ben', 'c-dee'].map((c, i) => JSON.stringify(call(app, 'GET', `/carts/${c}`, ['u-ana', 'u-ben', 'u-dee'][i]).body.cart.lines.map((l) => [l.productId, l.unitPrice, l.qty])));
    rename(app, 'p1', NEW);
    const problems = [];
    for (const [cart, owner] of [['c-ana', 'u-ana'], ['c-ben', 'u-ben']]) {
      if (cartLine(app, cart, owner)?.name !== NEW) problems.push(`${cart} shows ${cartLine(app, cart, owner)?.name}`);
    }
    const after = ['c-ana', 'c-ben', 'c-dee'].map((c, i) => JSON.stringify(call(app, 'GET', `/carts/${c}`, ['u-ana', 'u-ben', 'u-dee'][i]).body.cart.lines.map((l) => [l.productId, l.unitPrice, l.qty])));
    if (after.join() !== totals.join()) problems.push('cart prices or quantities changed');
    if (call(app, 'GET', '/carts/c-dee', 'u-dee').body.cart.lines[0].name !== 'Earl Grey Tea') problems.push('an unrelated cart line changed');
    return problems.join('; ') || null;
  }],
  ['wishlists show the new name', () => {
    const app = fresh();
    rename(app, 'p1', NEW);
    const problems = [];
    for (const u of ['u-ana', 'u-ben']) {
      const item = call(app, 'GET', `/wishlists/${u}`, u).body.items.find((i) => i.productId === 'p1');
      if (item?.name !== NEW) problems.push(`${u} wishlist shows ${item?.name}`);
    }
    if (call(app, 'GET', '/wishlists/u-ana', 'u-ana').body.items.find((i) => i.productId === 'p9')?.name !== 'Matcha Tea Tin') problems.push('another wishlist item changed');
    return problems.join('; ') || null;
  }],
  ['existing orders keep the purchase-time name', () => {
    const app = fresh();
    const read = () => JSON.stringify(['o-1001', 'o-1002'].map((o, i) => call(app, 'GET', `/orders/${o}`, ['u-ana', 'u-ben'][i]).body.order));
    const before = read();
    rename(app, 'p1', NEW);
    return read() === before ? null : 'an order line changed';
  }],
  ['an order placed after the rename carries the new name', () => {
    const app = fresh();
    rename(app, 'p1', NEW);
    const placed = call(app, 'POST', '/orders', 'u-ben', { cartId: 'c-ben' });
    const line = placed.body.order?.lines.find((l) => l.productId === 'p1');
    return line?.name === NEW ? null : `order line shows ${line?.name}`;
  }],
  ['the rename writes one audit event in the house shape', () => {
    const app = fresh();
    call(app, 'PUT', '/products/p1/price', 'u-admin', { price: 1250 });
    const [reference] = events(app, 'p1');
    rename(app, 'p1', NEW);
    const list = events(app, 'p1');
    if (list.length !== 2) return `${list.length} events for p1, want 2`;
    const e = list[1];
    const problems = [];
    if (keys(e) !== keys(reference)) problems.push(`keys ${keys(e)}`);
    if (keys(e.entity) !== keys(reference.entity) || e.entity?.type !== 'product' || e.entity?.id !== 'p1') problems.push(`entity ${JSON.stringify(e.entity)}`);
    if (e.actor !== 'u-admin') problems.push(`actor ${e.actor}`);
    if (!/^product\.[a-z]+(_[a-z]+)*$/.test(e.action ?? '') || /^product\.(created|price_changed|stock_adjusted)$/.test(e.action)) problems.push(`action ${e.action}`);
    if (JSON.stringify(e.changes) !== JSON.stringify({ name: { from: 'Blue Mug', to: NEW } })) problems.push(`changes ${JSON.stringify(e.changes)}`);
    return problems.join('; ') || null;
  }],
  ['two renames leave only the latest name and two events', () => {
    const app = fresh();
    rename(app, 'p1', NEW);
    rename(app, 'p1', 'Navy Flask');
    const problems = [];
    if (ids(q(app, 'cobalt')).length || ids(q(app, 'enamel')).includes('p1')) problems.push('an earlier name still finds p1');
    if (!ids(q(app, 'navy')).includes('p1')) problems.push('latest name not found');
    if (events(app, 'p1').length !== 2) problems.push(`${events(app, 'p1').length} events`);
    return problems.join('; ') || null;
  }],
  ['invalid names get the house error shape and change nothing', () => {
    const app = fresh();
    const ref = refError(app, 'PUT', '/products/p1/price', 'u-admin', { price: -5 });
    const problems = [];
    for (const bad of ['', '   ', 'x'.repeat(81), 123, null, undefined]) {
      const r = rename(app, 'p1', bad);
      const e = r.body?.error;
      if (r.status !== 400 || e?.code !== 'invalid_input' || e?.field !== 'name' || keys(e) !== keys(ref.body.error) || typeof e?.message !== 'string') problems.push(`${JSON.stringify(bad)?.slice(0, 12)} gave ${r.status} ${JSON.stringify(r.body)?.slice(0, 80)}`);
    }
    if (product(app, 'p1').name !== 'Blue Mug') problems.push('name changed');
    if (events(app, 'p1').length !== 0) problems.push('a failed rename wrote an event');
    return problems.join('; ') || null;
  }],
  ['names are trimmed and may be 80 characters', () => {
    const app = fresh();
    const problems = [];
    if (rename(app, 'p1', '  Cobalt Mug  ').status !== 200 || product(app, 'p1').name !== 'Cobalt Mug') problems.push(`trim gives ${product(app, 'p1').name}`);
    const long = 'a'.repeat(80);
    if (rename(app, 'p2', long).status !== 200 || product(app, 'p2').name !== long) problems.push('80 characters refused');
    return problems.join('; ') || null;
  }],
  ['an unknown id is not_found in the house shape', () => {
    const app = fresh();
    const ref = call(app, 'GET', '/products/p999');
    const r = rename(app, 'p999', NEW);
    if (r.status !== 404 || r.body?.error?.code !== 'not_found' || keys(r.body?.error) !== keys(ref.body.error)) return `gave ${r.status} ${JSON.stringify(r.body)?.slice(0, 80)}`;
    return JSON.stringify(call(app, 'GET', '/audit', 'u-admin').body.events) === '[]' ? null : 'an event was written';
  }],
  ['only admins rename', () => {
    const app = fresh();
    const ref = call(app, 'PUT', '/products/p1/price', 'u-ana', { price: 1 });
    const a = rename(app, 'p1', NEW, 'u-ana');
    const b = rename(app, 'p1', NEW, null);
    const problems = [];
    if (a.status !== 403 || a.body?.error?.code !== 'forbidden' || keys(a.body?.error) !== keys(ref.body.error)) problems.push(`customer gave ${a.status}`);
    if (b.status !== 401 || b.body?.error?.code !== 'unauthenticated') problems.push(`anonymous gave ${b.status}`);
    if (product(app, 'p1').name !== 'Blue Mug') problems.push('name changed');
    return problems.join('; ') || null;
  }],
  ['a name another product uses is a conflict, own case change is fine', () => {
    const app = fresh();
    const ref = call(app, 'POST', '/products', 'u-admin', { name: 'blue mug', category: 'mugs', price: 1 });
    const r = rename(app, 'p2', 'BLUE MUG');
    const problems = [];
    if (r.status !== 409 || r.body?.error?.code !== 'conflict' || r.body?.error?.field !== 'name' || keys(r.body?.error) !== keys(ref.body.error)) problems.push(`duplicate gave ${r.status} ${JSON.stringify(r.body)?.slice(0, 80)}`);
    if (rename(app, 'p1', 'blue mug').status !== 200 || product(app, 'p1').name !== 'blue mug') problems.push('case-only change refused');
    return problems.join('; ') || null;
  }],
];

if (loadError) {
  const total = cases.length + 1;
  console.log(JSON.stringify({ pass: false, defects: total, total, detail: [`src/app.mjs does not load: ${loadError}`] }));
  process.exit(0);
}

const detail = [];
for (const [name, run] of cases) {
  try {
    const problem = await run();
    if (problem) detail.push(`${name}: ${problem}`);
  } catch (error) {
    detail.push(`${name}: threw ${String(error?.message ?? error).slice(0, 120)}`);
  }
}

const env = { ...process.env };
for (const key of Object.keys(env)) if (key.startsWith('NODE_TEST')) delete env[key];
const tests = spawnSync('npm', ['test', '--silent'], { cwd: repo, env, encoding: 'utf8', timeout: 45_000, maxBuffer: 64 * 1024 * 1024 });
const total = cases.length + 1;
if (tests.status !== 0) detail.push('npm test fails');

console.log(JSON.stringify({ pass: detail.length === 0, defects: detail.length, total, detail }));
