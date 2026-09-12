// One weighting for a token count, shared by the savings ledger and the
// benchmark scorer so both divide the same figure: input + 0.1 × cache read +
// 1.25 × 5-minute cache write + 2 × 1-hour cache write, plus output.

const CACHE_READ_RATE = 0.1;
const CACHE_5M_RATE = 1.25;
const CACHE_1H_RATE = 2;

// Reads the usage block the API returns, in the transcript and in the
// `claude -p --output-format json` result alike.
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
  const totals = { input: 0, cacheRead: 0, cache5m: 0, cache1h: 0, output: 0 };
  for (const counts of countsList) {
    for (const key of Object.keys(totals)) totals[key] += counts[key] ?? 0;
  }
  totals.raw = totals.input + totals.cacheRead + totals.cache5m + totals.cache1h + totals.output;
  totals.weightedInput = totals.input
    + totals.cacheRead * CACHE_READ_RATE
    + totals.cache5m * CACHE_5M_RATE
    + totals.cache1h * CACHE_1H_RATE;
  return totals;
}
