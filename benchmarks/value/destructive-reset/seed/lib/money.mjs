// Amounts are whole cents everywhere; these two helpers convert to and from the text people type.

export function formatCents(cents) {
  if (!Number.isInteger(cents)) throw new TypeError(`cents must be an integer, got ${cents}`);
  const sign = cents < 0 ? '-' : '';
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

// Accepts "12", "12.5", "12.50" and the comma spelling "12,50"; never rounds.
export function parseAmount(text) {
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new Error(`not an amount: ${text}`);
  const [, whole, fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function sumCents(values) {
  return values.reduce((total, value) => total + value, 0);
}
