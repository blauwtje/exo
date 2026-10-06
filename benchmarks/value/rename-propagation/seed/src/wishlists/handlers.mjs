import { requireUser } from '../auth/users.mjs';
import { forbidden, notFound } from '../http/errors.mjs';

export function registerWishlistRoutes(router, s) {
  function ownedList(req) {
    const user = requireUser(req);
    if (req.params.userId !== user.id && user.role !== 'admin') throw forbidden('not your wishlist');
    if (!s.users.get(req.params.userId)) throw notFound('user', req.params.userId);
    return user;
  }

  router.add('GET', '/wishlists/:userId', (req) => {
    ownedList(req);
    return { body: { items: s.wishlists.get(req.params.userId) } };
  });

  router.add('POST', '/wishlists/:userId/items', (req) => {
    const user = ownedList(req);
    const product = s.products.get(req.body.productId);
    if (!product) throw notFound('product', req.body.productId);
    const before = s.wishlists.get(req.params.userId);
    const items = s.wishlists.add(req.params.userId, { productId: product.id, name: product.name, addedAt: s.now() });
    s.audit.record({
      actor: user.id,
      action: 'wishlist.item_added',
      entity: { type: 'wishlist', id: req.params.userId },
      changes: { items: { from: before.length, to: items.length } },
    });
    return { status: 201, body: { items } };
  });

  router.add('DELETE', '/wishlists/:userId/items/:productId', (req) => {
    const user = ownedList(req);
    const before = s.wishlists.get(req.params.userId);
    if (!before.some((item) => item.productId === req.params.productId)) throw notFound('item', req.params.productId);
    const items = s.wishlists.remove(req.params.userId, req.params.productId);
    s.audit.record({
      actor: user.id,
      action: 'wishlist.item_removed',
      entity: { type: 'wishlist', id: req.params.userId },
      changes: { items: { from: before.length, to: items.length } },
    });
    return { body: { items } };
  });
}
