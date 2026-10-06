# shopfront

The storefront's catalogue, cart and order service. Plain Node ESM with no
dependencies; all state lives in memory and is loaded from `data/` at start.

```bash
npm start      # serves on :3000, X-User header names the caller
npm test
```

## Layout

| Folder | What it holds |
|---|---|
| `src/app.mjs` | Builds the services, registers every route, turns a request into a response |
| `src/http/` | Router and the error helpers every handler throws |
| `src/auth/` | Users and the `requireUser` / `requireAdmin` guards |
| `src/products/` | Product store, input validation and the product routes |
| `src/search/` | In-memory search index and `GET /search` |
| `src/cache/` | Read-through cache, its key builders and invalidation |
| `src/carts/`, `src/wishlists/` | Per-user carts and wishlists |
| `src/orders/` | Orders, placed from a cart; see `docs/orders.md` |
| `src/audit/` | Append-only audit log and `GET /audit` |

## Routes

| Route | Who |
|---|---|
| `GET /products`, `GET /products/:id`, `GET /search?q=` | anyone |
| `POST /products`, `PUT /products/:id/price`, `POST /products/:id/stock` | admin |
| `GET /carts/:id`, `POST /carts/:id/lines`, `DELETE /carts/:id/lines/:productId` | cart owner or admin |
| `GET /wishlists/:userId`, `POST /wishlists/:userId/items`, `DELETE /wishlists/:userId/items/:productId` | owner or admin |
| `POST /orders`, `GET /orders/:id` | owner or admin |
| `GET /audit?entity=product:p1` | admin |

Errors are always `{ "error": { "code", "message", "field"? } }`.
