// The amount column of the processor export: a decimal number in the row's
// currency, negative for a refund (a leading minus or accounting parentheses),
// with optional thousands separators. Returns null when the text is not a number.
export function parseAmount(raw) {
  let text = String(raw).trim();
  let negative = false;
  const accounting = /^\((.*)\)$/.exec(text);
  if (accounting) {
    negative = true;
    text = accounting[1].trim();
  }
  if (/^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const value = Number(text);
  return negative ? -value : value;
}
