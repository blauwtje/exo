import { summarize } from './stats.mjs';

export function formatSummary(values) {
  const { count, mean, median, max } = summarize(values);
  if (count === 0) return 'no data';
  return `count=${count} mean=${mean} median=${median} max=${max}`;
}
