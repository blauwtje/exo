import { requireUser } from '../auth/users.mjs';
import { badRequest, forbidden, notFound } from '../http/errors.mjs';
import { orderTotal } from './store.mjs';

const present = (order) => ({ ...order, lines: order.lines.map((line) => ({ ...line })), totalCents: orderTotal(order) });

export function registerOrderRoutes(router, s) {
  router.add('POST', '/orders', (req) => {
    const user = requireUser(req);
    const cart = s.carts.get(req.body.cartId);
    if (!cart) throw notFound('cart', req.body.cartId);
    if (cart.userId !== user.id) throw forbidden('not your cart');
    if (cart.lines.length === 0) throw badRequest('cartId', 'cart is empty');
    const order = s.orders.place({ userId: user.id, lines: cart.lines });
    s.carts.clear(cart.id);
    s.audit.record({
      actor: user.id,
      action: 'order.placed',
      entity: { type: 'order', id: order.id },
      changes: { status: { from: null, to: order.status } },
    });
    return { status: 201, body: { order: present(order) } };
  });

  router.add('GET', '/orders/:id', (req) => {
    const user = requireUser(req);
    const order = s.orders.get(req.params.id);
    if (!order) throw notFound('order', req.params.id);
    if (order.userId !== user.id && user.role !== 'admin') throw forbidden('not your order');
    return { body: { order: present(order) } };
  });
}
