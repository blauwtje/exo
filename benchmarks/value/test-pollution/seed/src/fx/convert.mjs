import { rateFor } from './rates.mjs';

export function convert(cents, from, to) {
  if (from === to) return cents;
  return Math.round((cents / rateFor(from)) * rateFor(to));
}
