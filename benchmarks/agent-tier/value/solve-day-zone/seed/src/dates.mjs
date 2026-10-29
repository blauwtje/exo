const DAY_MS = 86_400_000;

const pad = (value) => String(value).padStart(2, '0');

export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDay(key) {
  return new Date(`${key}T00:00:00`);
}

export function addDays(key, days) {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function daysBetween(fromKey, toKey) {
  return Math.floor((parseDay(toKey) - parseDay(fromKey)) / DAY_MS);
}
