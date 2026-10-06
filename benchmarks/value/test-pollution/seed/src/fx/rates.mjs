const RATES_PER_USD = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.4 };

export function rateFor(currency) {
  const rate = RATES_PER_USD[currency];
  if (rate === undefined) throw new Error(`no rate for ${currency}`);
  return rate;
}

export function setRate(currency, rate) {
  RATES_PER_USD[currency] = rate;
}
