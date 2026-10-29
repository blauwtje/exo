export function formatMoney(cents, currency = 'USD') {
  const units = (cents / 100).toFixed(2);
  return `${units} ${currency}`;
}
