import { findProduct } from './products.mjs';

const overrides = new Map();

export function listPrice(tenant, sku) {
  const cached = overrides.get(`${tenant.id}:${sku}`);
  if (cached !== undefined) return cached;
  const override = tenant.priceList[sku];
  if (override === undefined) return findProduct(sku).basePrice;
  const price = Math.round(override);
  overrides.set(`${tenant.id}:${sku}`, price);
  return price;
}
