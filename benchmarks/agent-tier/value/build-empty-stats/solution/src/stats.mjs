const isUsable = (value) => typeof value === 'number' && Number.isFinite(value);

export function summarize(values) {
  const sorted = values.filter(isUsable).sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return { count, mean: null, median: null, max: null };
  const mean = sorted.reduce((sum, value) => sum + value, 0) / count;
  const middle = Math.floor(count / 2);
  const median = count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return { count, mean, median, max: sorted[count - 1] };
}
