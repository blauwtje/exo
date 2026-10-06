import { registerAuditRoutes } from './audit/handlers.mjs';
import { createAuditLog } from './audit/log.mjs';
import { createUsers } from './auth/users.mjs';
import { createCache } from './cache/store.mjs';
import { registerCartRoutes } from './carts/handlers.mjs';
import { createCartStore } from './carts/store.mjs';
import { notFound, toResponse } from './http/errors.mjs';
import { createRouter } from './http/router.mjs';
import { registerOrderRoutes } from './orders/handlers.mjs';
import { createOrderStore } from './orders/store.mjs';
import { registerProductRoutes } from './products/handlers.mjs';
import { createProductStore } from './products/store.mjs';
import { registerSearchRoutes } from './search/handlers.mjs';
import { createSearchIndex, toSearchDoc } from './search/index.mjs';
import { systemClock } from './util/clock.mjs';
import { registerWishlistRoutes } from './wishlists/handlers.mjs';
import { createWishlistStore } from './wishlists/store.mjs';

export function createApp({ data, now = systemClock } = {}) {
  const services = {
    now,
    users: createUsers(data.users),
    products: createProductStore(data.products, now),
    index: createSearchIndex(),
    cache: createCache(),
    carts: createCartStore(data.carts),
    wishlists: createWishlistStore(data.wishlists),
    orders: createOrderStore(data.orders, now),
    audit: createAuditLog(now),
  };

  for (const product of services.products.all()) services.index.upsert(toSearchDoc(product));

  const router = createRouter();
  registerProductRoutes(router, services);
  registerSearchRoutes(router, services);
  registerCartRoutes(router, services);
  registerWishlistRoutes(router, services);
  registerOrderRoutes(router, services);
  registerAuditRoutes(router, services);

  return {
    services,
    handle({ method, path, body, headers = {} }) {
      const url = new URL(path, 'http://shop.local');
      const verb = method.toUpperCase();
      const matched = router.match(verb, url.pathname);
      try {
        if (!matched) throw notFound('route', `${verb} ${url.pathname}`);
        const req = {
          method: verb,
          path: url.pathname,
          params: matched.params,
          query: Object.fromEntries(url.searchParams),
          body: body ?? {},
          user: services.users.fromHeaders(headers),
        };
        const result = matched.handler(req);
        return { status: result.status ?? 200, body: result.body };
      } catch (error) {
        return toResponse(error);
      }
    },
  };
}
