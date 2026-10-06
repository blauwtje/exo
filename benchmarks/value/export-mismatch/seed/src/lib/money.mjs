// Amounts are integers in minor units (cents); rates are plain numbers.

export function roundHalfAway(value) {
  if (value === 0) return 0;
  return Math.sign(value) * Math.round(Math.abs(value));
}

export function convertMinor(amountMinor, rate) {
  return roundHalfAway(amountMinor * rate);
}

// "129.00", "-12.5" and "7" to 12900, -1250 and 700.
export function parseMinor(text) {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(text).trim());
  if (!match) throw new Error(`not an amount: ${text}`);
  const minor = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'));
  return match[1] ? -minor : minor;
}

export function formatMinor(minor, { grouping = false } = {}) {
  const sign = minor < 0 ? '-' : '';
  const absolute = Math.abs(minor);
  const whole = Math.floor(absolute / 100);
  const cents = String(absolute % 100).padStart(2, '0');
  return `${sign}${grouping ? whole.toLocaleString('en-US') : whole}.${cents}`;
}
