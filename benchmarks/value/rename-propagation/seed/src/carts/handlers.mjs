import { requireUser } from '../auth/users.mjs';
import { badRequest, forbidden, notFound } from '../http/errors.mjs';
import { cartTotal } from './store.mjs';

const present = (cart) => ({ id: cart.id, userId: cart.userId, lines: cart.lines, totalCents: cartTotal(cart) });

export function registerCartRoutes(router, s) {
  function ownedCart(req) {
    const user = requireUser(req);
    const cart = s.carts.get(req.params.id);
    if (!cart) throw notFound('cart', req.params.id);
    if (cart.userId !== user.id && user.role !== 'admin') throw forbidden('not your cart');
    return { user, cart };
  }

  router.add('GET', '/carts/:id', (req) => ({ body: { cart: present(ownedCart(req).cart) } }));

  router.add('POST', '/carts/:id/lines', (req) => {
    const { user, cart } = ownedCart(req);
    const product = s.products.get(req.body.productId);
    if (!product) throw notFound('product', req.body.productId);
    const qty = req.body.qty ?? 1;
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw badRequest('qty', 'qty must be an integer from 1 to 99');
    const updated = s.carts.addLine(cart.id, { productId: product.id, name: product.name, unitPrice: product.price, qty });
    s.audit.record({
      actor: user.id,
      action: 'cart.line_added',
      entity: { type: 'cart', id: cart.id },
      changes: { lines: { from: cart.lines.length, to: updated.lines.length } },
    });
    return { status: 201, body: { cart: present(updated) } };
  });

  router.add('DELETE', '/carts/:id/lines/:productId', (req) => {
    const { user, cart } = ownedCart(req);
    if (!cart.lines.some((line) => line.productId === req.params.productId)) throw notFound('line', req.params.productId);
    const updated = s.carts.removeLine(cart.id, req.params.productId);
    s.audit.record({
      actor: user.id,
      action: 'cart.line_removed',
      entity: { type: 'cart', id: cart.id },
      changes: { lines: { from: cart.lines.length, to: updated.lines.length } },
    });
    return { body: { cart: present(updated) } };
  });
}
