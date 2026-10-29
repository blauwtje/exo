export function loadRates(text) {
  const rates = {};
  for (const line of text.split('\n')) {
    if (!line.includes('=') && !line.includes(':')) continue;
    const [region, percent] = line.split(/[=:]/);
    rates[region] = { percent: Number(percent) };
  }
  return rates;
}
