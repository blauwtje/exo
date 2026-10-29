import { RATE_TEXT } from './config.mjs';
import { loadRates } from './rates.mjs';

const rates = loadRates(RATE_TEXT);

export function taxFor({ region, netMinor }) {
  const rate = rates[region.toLowerCase()];
  return Math.round((netMinor * rate.percent) / 100);
}
