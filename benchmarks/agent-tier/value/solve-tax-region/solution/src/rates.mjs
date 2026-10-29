export function normalizeRegion(region) {
  return String(region).trim().toLowerCase();
}

export function loadRates(text) {
  const rates = {};
  for (const line of text.split('\n')) {
    const content = line.trim();
    if (!content || content.startsWith('#')) continue;
    const [region, percent] = content.split(/[=:]/);
    rates[normalizeRegion(region)] = { percent: Number(percent) };
  }
  return rates;
}
