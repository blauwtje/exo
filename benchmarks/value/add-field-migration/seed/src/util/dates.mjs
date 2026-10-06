const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function today(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function isIsoDate(text) {
  if (typeof text !== 'string' || !ISO_DATE.test(text)) return false;
  return !Number.isNaN(Date.parse(`${text}T00:00:00Z`));
}

export function addDays(iso, days) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
