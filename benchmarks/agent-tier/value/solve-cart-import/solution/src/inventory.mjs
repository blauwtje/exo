export function createInventory(stock) {
  const levels = new Map(Object.entries(stock));
  return {
    level: (sku) => levels.get(sku) ?? 0,
    take(sku, qty) {
      levels.set(sku, (levels.get(sku) ?? 0) - qty);
    }
  };
}
