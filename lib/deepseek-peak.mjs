const HOUR_MS = 3600000;
const SEARCH_HOURS = 24 * 8;

function isPeakHour(timeMs, { days, hoursUtc }) {
  const date = new Date(timeMs);
  const hour = date.getUTCHours();
  return days.includes(date.getUTCDay()) && hoursUtc.some(([from, to]) => hour >= from && hour < to);
}

export function deepseekPeak(timeMs, windows) {
  if (!isPeakHour(timeMs, windows)) return { peak: false, nextOffPeak: null };
  const hourStart = Math.floor(timeMs / HOUR_MS) * HOUR_MS;
  for (let step = 1; step <= SEARCH_HOURS; step += 1) {
    const candidate = hourStart + step * HOUR_MS;
    if (!isPeakHour(candidate, windows)) return { peak: true, nextOffPeak: new Date(candidate).toISOString() };
  }
  return { peak: true, nextOffPeak: null };
}

export function peakNotice(timeMs, windows) {
  const { peak, nextOffPeak } = deepseekPeak(timeMs, windows);
  if (!peak) return null;
  const until = nextOffPeak === null ? 'no off-peak hour is configured' : `off-peak starts at ${nextOffPeak}`;
  return `notice: DeepSeek peak hours bill double; ${until}.`;
}
