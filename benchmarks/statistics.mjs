// benchmarks/statistics.mjs
// The mean and sample standard deviation the scorer and the calibration share.

export function meanAndSd(values) {
  if (values.length === 0) return { mean: null, sd: null, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { mean, sd: 0, n: 1 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance), n: values.length };
}
