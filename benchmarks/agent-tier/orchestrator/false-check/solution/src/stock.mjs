export function reserve(stock, sku, qty) {
  const have = stock[sku] ?? 0;
  if (qty > have) throw new RangeError(`only ${have} of ${sku}`);
  return { ...stock, [sku]: have - qty };
}
