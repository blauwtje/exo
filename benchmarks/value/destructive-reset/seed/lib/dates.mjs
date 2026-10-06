// Dates are plain YYYY-MM-DD strings; the time of day never matters to the shop.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function isIsoDate(text) {
  if (typeof text !== 'string') return false;
  const match = ISO_DATE.exec(text);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function monthOf(text) {
  if (!isIsoDate(text)) throw new Error(`not a date: ${text}`);
  return text.slice(0, 7);
}

export function daysBetween(from, to) {
  for (const text of [from, to]) {
    if (!isIsoDate(text)) throw new Error(`not a date: ${text}`);
  }
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
