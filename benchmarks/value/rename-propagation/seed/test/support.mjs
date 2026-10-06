import fs from 'node:fs';
import { createApp } from '../src/app.mjs';
import { createClock } from '../src/util/clock.mjs';

const read = (name) => JSON.parse(fs.readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));

export function createTestApp() {
  const data = Object.fromEntries(['products', 'users', 'carts', 'orders', 'wishlists'].map((name) => [name, read(name)]));
  return createApp({ data, now: createClock() });
}

export function call(app, method, path, { as, body } = {}) {
  return app.handle({ method, path, body, headers: as ? { 'x-user': as } : {} });
}
