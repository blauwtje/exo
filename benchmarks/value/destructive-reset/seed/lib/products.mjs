// Products are looked up by sku; stock only ever moves through adjustStock.

import { getTable } from './tables.mjs';

export function findBySku(database, sku) {
  return getTable(database, 'products').rows.find((product) => product.sku === sku);
}

export function priceOf(database, sku) {
  const product = findBySku(database, sku);
  if (!product) throw new Error(`unknown sku ${sku}`);
  return product.price_cents;
}

export function adjustStock(database, sku, delta) {
  const product = findBySku(database, sku);
  if (!product) throw new Error(`unknown sku ${sku}`);
  if (!Number.isInteger(delta)) throw new TypeError(`stock change must be an integer, got ${delta}`);
  if (product.stock + delta < 0) throw new Error(`not enough stock for ${sku}: ${product.stock} left`);
  product.stock += delta;
  return product.stock;
}

// Products at or under the threshold, the emptiest shelf first.
export function lowStock(database, threshold = 15) {
  return getTable(database, 'products').rows
    .filter((product) => product.stock <= threshold)
    .sort((a, b) => a.stock - b.stock || a.sku.localeCompare(b.sku));
}
