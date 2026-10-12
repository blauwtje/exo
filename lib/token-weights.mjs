const CACHE_READ_RATE = 0.1;
const CACHE_5M_RATE = 1.25;
const CACHE_1H_RATE = 2;

export const COUNT_KEYS = ['input', 'cacheRead', 'cache5m', 'cache1h', 'output'];

export function usageCounts(usage) {
  const creation = usage.cache_creation;
  return {
    input: usage.input_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cache5m: creation ? (creation.ephemeral_5m_input_tokens ?? 0) : (usage.cache_creation_input_tokens ?? 0),
    cache1h: creation ? (creation.ephemeral_1h_input_tokens ?? 0) : 0,
    output: usage.output_tokens ?? 0
  };
}

export function sumCounts(countsList) {
  const totals = Object.fromEntries(COUNT_KEYS.map((key) => [key, 0]));
  for (const counts of countsList) {
    for (const key of COUNT_KEYS) totals[key] += counts[key] ?? 0;
  }
  totals.raw = totals.input + totals.cacheRead + totals.cache5m + totals.cache1h + totals.output;
  totals.weightedInput = totals.input
    + totals.cacheRead * CACHE_READ_RATE
    + totals.cache5m * CACHE_5M_RATE
    + totals.cache1h * CACHE_1H_RATE;
  return totals;
}
