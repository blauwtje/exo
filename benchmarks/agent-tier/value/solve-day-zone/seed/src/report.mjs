import { addDays, dayKey } from './dates.mjs';

export function dailyTotals(orders) {
  const totals = {};
  for (const order of orders) {
    const day = dayKey(new Date(order.placedAt));
    totals[day] = (totals[day] ?? 0) + order.amountMinor;
  }
  return totals;
}

export function weeklyDates(startKey, count) {
  return Array.from({ length: count }, (_, index) => addDays(startKey, index * 7));
}
