import { requireAdmin } from '../auth/users.mjs';
import { invalidateListings, invalidateProduct } from '../cache/invalidate.mjs';
import { listKey, productKey } from '../cache/keys.mjs';
import { badRequest, conflict, notFound } from '../http/errors.mjs';
import { toSearchDoc } from '../search/index.mjs';
import { validateCategory, validateName, validatePrice, validateStock, validateStockDelta } from './validation.mjs';

const toPublic = ({ id, name, category, price, stock }) => ({ id, name, category, price, stock });

export function registerProductRoutes(router, s) {
  router.add('GET', '/products', (req) => {
    const key = listKey(req.query.category);
    const cached = s.cache.get(key);
    if (cached) return { body: cached };
    const items = req.query.category ? s.products.byCategory(req.query.category) : s.products.all();
    const body = { products: items.map(toPublic) };
    s.cache.set(key, body);
    return { body };
  });

  router.add('GET', '/products/:id', (req) => {
    const key = productKey(req.params.id);
    const cached = s.cache.get(key);
    if (cached) return { body: cached };
    const product = s.products.get(req.params.id);
    if (!product) throw notFound('product', req.params.id);
    const body = { product: toPublic(product) };
    s.cache.set(key, body);
    return { body };
  });

  router.add('POST', '/products', (req) => {
    const actor = requireAdmin(req);
    const name = validateName(req.body.name);
    const price = validatePrice(req.body.price);
    const category = validateCategory(req.body.category);
    const stock = validateStock(req.body.stock ?? 0);
    if (s.products.findByName(name)) throw conflict('name', `a product named "${name}" already exists`);
    const product = s.products.insert({ name, category, price, stock });
    s.index.upsert(toSearchDoc(product));
    invalidateListings(s.cache);
    s.audit.record({
      actor: actor.id,
      action: 'product.created',
      entity: { type: 'product', id: product.id },
      changes: { name: { from: null, to: name }, price: { from: null, to: price } },
    });
    return { status: 201, body: { product: toPublic(product) } };
  });

  router.add('PATCH', '/products/:id', (req) => {
    const actor = requireAdmin(req);
    const before = s.products.get(req.params.id);
    if (!before) throw notFound('product', req.params.id);
    const name = validateName(req.body.name);
    const clash = s.products.findByName(name);
    if (clash && clash.id !== before.id) throw conflict('name', `a product named "${name}" already exists`);
    const product = s.products.update(before.id, { name });
    s.index.upsert(toSearchDoc(product));
    invalidateProduct(s.cache, product.id);
    s.carts.renameProduct(product.id, name);
    s.wishlists.renameProduct(product.id, name);
    s.audit.record({
      actor: actor.id,
      action: 'product.name_changed',
      entity: { type: 'product', id: product.id },
      changes: { name: { from: before.name, to: name } },
    });
    return { body: { product: toPublic(product) } };
  });

  router.add('PUT', '/products/:id/price', (req) => {
    const actor = requireAdmin(req);
    const before = s.products.get(req.params.id);
    if (!before) throw notFound('product', req.params.id);
    const price = validatePrice(req.body.price);
    const product = s.products.update(before.id, { price });
    s.index.upsert(toSearchDoc(product));
    invalidateProduct(s.cache, product.id);
    s.carts.repriceProduct(product.id, price);
    s.audit.record({
      actor: actor.id,
      action: 'product.price_changed',
      entity: { type: 'product', id: product.id },
      changes: { price: { from: before.price, to: price } },
    });
    return { body: { product: toPublic(product) } };
  });

  router.add('POST', '/products/:id/stock', (req) => {
    const actor = requireAdmin(req);
    const before = s.products.get(req.params.id);
    if (!before) throw notFound('product', req.params.id);
    const delta = validateStockDelta(req.body.delta);
    if (before.stock + delta < 0) throw badRequest('delta', 'stock cannot go below zero');
    const product = s.products.update(before.id, { stock: before.stock + delta });
    s.index.upsert(toSearchDoc(product));
    invalidateProduct(s.cache, product.id);
    s.audit.record({
      actor: actor.id,
      action: 'product.stock_adjusted',
      entity: { type: 'product', id: product.id },
      changes: { stock: { from: before.stock, to: product.stock } },
    });
    return { body: { product: toPublic(product) } };
  });
}
