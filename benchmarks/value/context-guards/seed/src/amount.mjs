// The amount column of the processor export: a decimal number in the row's
// currency, negative for a refund. Returns null when the text is not a number.
export function parseAmount(raw) {
  const text = String(raw).trim();
  const value = parseFloat(text);
  return Number.isFinite(value) ? value : null;
}
