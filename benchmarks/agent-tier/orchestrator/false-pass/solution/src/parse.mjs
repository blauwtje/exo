export function parseAmount(text) {
  const value = Number(text.trim());
  if (Number.isNaN(value)) throw new TypeError(`not an amount: ${text}`);
  if (value < 0) throw new RangeError('negative amount');
  return value;
}
