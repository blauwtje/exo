// What usage counts cost at a model's API list price in prices.mjs, each count
// at its own rate: the cache rates are not one multiple of the input rate for
// every model.

import PRICES from './prices.mjs';

const TOKENS_PER_PRICE_UNIT = 1e6;
const COUNT_KEYS = ['input', 'cacheRead', 'cache5m', 'cache1h', 'output'];

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
export function countsCost(counts, model) {
  const price = modelPrice(model);
  if (price === null) return COUNT_KEYS.every((key) => (counts[key] ?? 0) === 0) ? 0 : null;
  let perMillion = 0;
  for (const key of COUNT_KEYS) perMillion += (counts[key] ?? 0) * price[key];
  return perMillion / TOKENS_PER_PRICE_UNIT;
}
