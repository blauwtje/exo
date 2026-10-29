import { summarize } from './stats.mjs';

export function formatSummary(values) {
  const { count, mean, median, max } = summarize(values);
  return `count=${count} mean=${mean} median=${median} max=${max}`;
}
