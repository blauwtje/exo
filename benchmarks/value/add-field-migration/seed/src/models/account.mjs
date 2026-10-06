export function currencyOf(account, org) {
  const own = typeof account.currency === 'string' ? account.currency.trim().toUpperCase() : '';
  return own === '' ? org.defaultCurrency : own;
}
