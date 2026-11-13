import { sumCounts } from '#token-weights';
import { countsCost } from './pricing.mjs';

export function hitRate(counts) {
  const prompt = counts.input + counts.cacheRead + counts.cache5m + counts.cache1h;
  if (prompt === 0) return null;
  return counts.cacheRead / prompt;
}

export function countsByModel(calls) {
  const grouped = {};
  for (const counts of Object.values(calls)) {
    const model = counts.model ?? 'unknown';
    grouped[model] = grouped[model] ?? [];
    grouped[model].push(counts);
  }
  return Object.fromEntries(Object.entries(grouped).map(([model, list]) => [model, sumCounts(list)]));
}

function roleCost(calls) {
  let total = 0;
  for (const [model, counts] of Object.entries(countsByModel(calls))) {
    const cost = countsCost(counts, model);
    if (cost === null) return null;
    total += cost;
  }
  return total;
}

export function byRoleUsage(calls, readTokens) {
  const grouped = {};
  for (const call of Object.values(calls)) {
    grouped[call.role] = grouped[call.role] ?? [];
    grouped[call.role].push(call);
  }
  const byRole = {};
  for (const role of new Set([...Object.keys(grouped), ...Object.keys(readTokens)])) {
    const roleCalls = grouped[role] ?? [];
    const counts = sumCounts(roleCalls);
    byRole[role] = {
      counts,
      hitRate: hitRate(counts),
      costUsd: roleCost(roleCalls),
      estimatedReadTokens: readTokens[role] ?? 0
    };
  }
  return byRole;
}
