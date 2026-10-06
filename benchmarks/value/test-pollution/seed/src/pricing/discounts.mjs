import { memoize } from '../util/memo.mjs';

const DEFAULT_TIERS = [
  { min: 10, rateBps: 500 },
  { min: 50, rateBps: 1000 },
  { min: 200, rateBps: 1500 },
];

const tiersFor = memoize(
  (tenant) => [...(tenant.volumeTiers ?? DEFAULT_TIERS)].sort((a, b) => b.min - a.min),
  (tenant) => tenant.id,
);

export function volumeRate(tenant, quantity) {
  const tier = tiersFor(tenant).find((candidate) => quantity >= candidate.min);
  return tier ? tier.rateBps : 0;
}
