import { ValidationError } from '../util/errors.mjs';

const REGION_RATES_BPS = {
  US: 800,
  DE: 1900,
  GB: 2000,
  NL: 2100,
  FR: 2000,
};

export function regionRateBps(region) {
  const rate = REGION_RATES_BPS[region];
  if (rate === undefined) throw new ValidationError(`no tax rate for region "${region}"`);
  return rate;
}

export function knownRegions() {
  return Object.keys(REGION_RATES_BPS);
}
