export function addToCart(cart, body) {
  const { sku, qty } = body;
  if (!Number.isInteger(qty) || qty < 1) return { status: 400, error: 'qty must be a positive integer' };
  if (cart.available(sku) < qty) return { status: 409, error: 'insufficient stock' };
  cart.add(sku, qty);
  return { status: 200, quantity: cart.quantity(sku) };
}
