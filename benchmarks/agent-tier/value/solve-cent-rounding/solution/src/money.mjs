export function toCents(amount) {
  return Math.round(amount * 100);
}

export function percentOfCents(cents, percent) {
  return Math.floor((cents * percent + 50) / 100);
}

export function formatCents(cents) {
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, '0')}`;
}

export function format(amount) {
  return formatCents(toCents(amount));
}
