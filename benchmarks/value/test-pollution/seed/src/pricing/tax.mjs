import { regionRateBps } from '../config/regions.mjs';
import { memoize } from '../util/memo.mjs';

const resolveRate = memoize(
  (tenant, category) => tenant.taxOverrides[category] ?? regionRateBps(tenant.region),
  (tenant, category) => `${tenant.id}:${category}`,
);

export function taxRate(tenant, category) {
  return resolveRate(tenant, category);
}
