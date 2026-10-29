const DAY_MS = 86_400_000;

const pad = (value) => String(value).padStart(2, '0');

export function dayKey(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function parseDay(key) {
  return new Date(`${key}T00:00:00Z`);
}

export function addDays(key, days) {
  const date = parseDay(key);
  date.setUTCDate(date.getUTCDate() + days);
  return dayKey(date);
}

export function daysBetween(fromKey, toKey) {
  return Math.floor((parseDay(toKey) - parseDay(fromKey)) / DAY_MS);
}
