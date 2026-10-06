import { currentMode } from './rounding.mjs';

// Rounds a fractional number of cents to whole cents with the current mode.
export function roundMoney(cents) {
  switch (currentMode()) {
    case 'floor':
      return Math.floor(cents);
    case 'ceil':
      return Math.ceil(cents);
    default:
      return Math.round(cents);
  }
}

// `bps` basis points of `cents`, rounded to whole cents.
export function percentOf(cents, bps) {
  return roundMoney((cents * bps) / 10000);
}

export function formatMoney(cents) {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}
