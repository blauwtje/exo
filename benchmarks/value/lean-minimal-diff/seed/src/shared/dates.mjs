// Calendar-day formatting shared by exports and reports.

export function isoDay(date) {
  return date.toISOString().slice(0, 10);
}
