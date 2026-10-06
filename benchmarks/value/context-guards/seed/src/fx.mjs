import { parseCsv } from './csv.mjs';

const MAX_LOOKBACK_DAYS = 2; // a weekend: Saturday and Sunday use Friday's rate
const DAY_MS = 86_400_000;

function shiftDay(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// Rates file columns: date, currency, rate (EUR per one unit of the currency).
export function createFx(text, log) {
  const rates = new Map();
  for (const row of parseCsv(text)) rates.set(`${row.currency}|${row.date}`, Number(row.rate));

  return {
    rateFor(currency, date) {
      if (currency === 'EUR') return 1;
      for (let back = 0; back <= MAX_LOOKBACK_DAYS; back++) {
        const day = shiftDay(date, -back);
        const rate = rates.get(`${currency}|${day}`);
        if (rate !== undefined) {
          if (back > 0) log.warn(`fx: no ${currency} rate for ${date}, using ${day}`);
          return rate;
        }
      }
      log.warn(`fx: no ${currency} rate within ${MAX_LOOKBACK_DAYS} days of ${date}, using 1`);
      return 1;
    },
  };
}
