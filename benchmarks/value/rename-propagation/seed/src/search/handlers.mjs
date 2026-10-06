import { searchKey } from '../cache/keys.mjs';
import { badRequest } from '../http/errors.mjs';

export function registerSearchRoutes(router, s) {
  router.add('GET', '/search', (req) => {
    const q = (req.query.q ?? '').trim();
    if (!q) throw badRequest('q', 'q must not be empty');
    const key = searchKey(q);
    const cached = s.cache.get(key);
    if (cached) return { body: cached };
    const results = s.index.query(q).map(({ id, name, price, inStock }) => ({ id, name, price, inStock }));
    const body = { query: q, results };
    s.cache.set(key, body);
    return { body };
  });
}
