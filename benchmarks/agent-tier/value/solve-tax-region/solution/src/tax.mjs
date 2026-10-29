import { RATE_TEXT } from './config.mjs';
import { loadRates, normalizeRegion } from './rates.mjs';

const rates = loadRates(RATE_TEXT);

export function taxFor({ region, netMinor }) {
  const rate = rates[normalizeRegion(region)];
  if (!rate) throw new Error(`unknown tax region: ${region}`);
  return Math.round((netMinor * rate.percent) / 100);
}
