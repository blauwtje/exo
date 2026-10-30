export function parseAmount(text) {
  const value = Number(text.trim());
  if (Number.isNaN(value)) throw new TypeError(`not an amount: ${text}`);
  return value;
}
