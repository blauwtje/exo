export function reserve(stock, sku, qty) {
  const have = stock[sku] ?? 0;
  return { ...stock, [sku]: have - qty };
}
