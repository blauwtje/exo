export function createCartStore(records) {
  const carts = new Map(records.map((cart) => [cart.id, structuredClone(cart)]));

  return {
    get: (id) => (carts.has(id) ? structuredClone(carts.get(id)) : null),
    addLine(cartId, line) {
      const cart = carts.get(cartId);
      const existing = cart.lines.find((candidate) => candidate.productId === line.productId);
      if (existing) existing.qty += line.qty;
      else cart.lines.push({ ...line });
      return structuredClone(cart);
    },
    removeLine(cartId, productId) {
      const cart = carts.get(cartId);
      cart.lines = cart.lines.filter((line) => line.productId !== productId);
      return structuredClone(cart);
    },
    clear(cartId) {
      carts.get(cartId).lines = [];
    },
    renameProduct(productId, name) {
      for (const cart of carts.values()) {
        for (const line of cart.lines) {
          if (line.productId === productId) line.name = name;
        }
      }
    },
    repriceProduct(productId, unitPrice) {
      for (const cart of carts.values()) {
        for (const line of cart.lines) {
          if (line.productId === productId) line.unitPrice = unitPrice;
        }
      }
    },
  };
}

export const cartTotal = (cart) => cart.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
