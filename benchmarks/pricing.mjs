// What usage counts cost at a model's API list price in prices.mjs, each count
// at its own rate: the cache rates are not one multiple of the input rate for
// every model.

import PRICES from './prices.mjs';
import { COUNT_KEYS } from '#token-weights';

const TOKENS_PER_PRICE_UNIT = 1e6;

// A model id prices as the longest family it starts with.
export function modelPrice(model) {
  if (typeof model !== 'string') return null;
  let family = null;
  for (const candidate of Object.keys(PRICES.models)) {
    if (model.startsWith(candidate) && (family === null || candidate.length > family.length)) family = candidate;
  }
  return family === null ? null : PRICES.models[family];
}

// Null when the model is unlisted and any count is non-zero, because an
// unknown price is never guessed. A negative count prices as a credit.
export function countsCost(counts, model, { peak = false } = {}) {
  const price = modelPrice(model);
  if (price === null) return COUNT_KEYS.every((key) => (counts[key] ?? 0) === 0) ? 0 : null;
  let perMillion = 0;
  for (const key of COUNT_KEYS) perMillion += (counts[key] ?? 0) * price[key];
  const factor = peak ? price.peakFactor ?? 1 : 1;
  return (perMillion * factor) / TOKENS_PER_PRICE_UNIT;
}

export function isPeak(timeMs) {
  const date = new Date(timeMs);
  const hour = date.getUTCHours();
  return PRICES.peak.days.includes(date.getUTCDay()) && PRICES.peak.hoursUtc.some(([from, to]) => hour >= from && hour < to);
}

export function usageCost(byModel, startedAtMs) {
  const peak = isPeak(startedAtMs);
  let costUsd = 0;
  let cacheHitTokens = 0;
  let cacheMissTokens = 0;
  for (const [model, counts] of Object.entries(byModel)) {
    const cost = countsCost(counts, model, { peak });
    if (cost === null) return { costUsd: null, cacheHitTokens: null, cacheMissTokens: null };
    costUsd += cost;
    cacheHitTokens += counts.cacheRead ?? 0;
    cacheMissTokens += (counts.input ?? 0) + (counts.cache5m ?? 0) + (counts.cache1h ?? 0);
  }
  return { costUsd, cacheHitTokens, cacheMissTokens };
}

export function recordCostFields(cell, result, usage, wallMs) {
  if (String(cell.model).startsWith('deepseek') && usage?.byModel) return usageCost(usage.byModel, Date.now() - wallMs);
  if (cell.runSession) return { costUsd: usage?.costUsd ?? null };
  return { costUsd: typeof result?.total_cost_usd === 'number' ? result.total_cost_usd : null };
}
