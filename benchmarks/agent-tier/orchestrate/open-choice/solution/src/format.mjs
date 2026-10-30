export function padCents(cents) {
  return String(Math.abs(cents) % 100).padStart(2, '0');
}

export function formatPrice(cents, code) {
  const sign = cents < 0 ? '-' : '';
  return `${sign}${Math.floor(Math.abs(cents) / 100)}.${padCents(cents)} ${code}`;
}
