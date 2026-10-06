const FORMATTERS = new Map();

function formatterFor(currency) {
  if (!FORMATTERS.has(currency)) {
    FORMATTERS.set(currency, new Intl.NumberFormat('en-US', { style: 'currency', currency }));
  }
  return FORMATTERS.get(currency);
}

export function formatMoney(cents, currency) {
  return formatterFor(currency).format(cents / 100);
}

export function sumCents(values) {
  return values.reduce((sum, value) => sum + value, 0);
}
