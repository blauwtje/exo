// benchmarks/statistics.mjs
// The mean and sample standard deviation the scorer and the calibration share.

export function meanAndSd(values) {
  if (values.length === 0) return { mean: null, sd: null, n: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) return { mean, sd: null, n: 1 };
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1);
  return { mean, sd: Math.sqrt(variance), n: values.length };
}

// The comparison rule below is PROCEDURE step 5, hardcoded: it defines what a
// rise means, so no flag or config overrides it.
export const RISE_Z = 2; // PROCEDURE step 5: a rise is a difference above 2 SE_diff.
export const POWER_Z = 0.84; // PROCEDURE step 5: z for 80% power when sizing the next run.
export const SMALLEST_RISE = 0.3; // PROCEDURE step 5: the 30% change the next run must detect.
export const MAX_RUNS = 22; // PROCEDURE step 5: the most runs per arm.
export const PLANNING_CV = 0.25; // PROCEDURE step 5: the pooled CV used when none can be computed.

// after − before with a standard-error verdict; both arrays hold numbers only.
export function compareMeans(before, after) {
  const left = meanAndSd(before);
  const right = meanAndSd(after);
  const diff = left.mean === null || right.mean === null ? null : right.mean - left.mean;
  if (left.n < 2 || right.n < 2) return { diff, twoSeDiff: null, verdict: 'no SE' };
  const seDiff = Math.sqrt((left.sd / Math.sqrt(left.n)) ** 2 + (right.sd / Math.sqrt(right.n)) ** 2);
  const twoSeDiff = RISE_Z * seDiff;
  let verdict = 'noise';
  if (diff > twoSeDiff) verdict = 'rise';
  else if (diff < -twoSeDiff) verdict = 'fall';
  return { diff, twoSeDiff, verdict };
}

// Runs per arm that detect a SMALLEST_RISE change at the given CV.
export function nextRuns(cv) {
  const usable = Number.isFinite(cv) && cv > 0 ? cv : PLANNING_CV;
  return Math.min(MAX_RUNS, Math.max(2, Math.ceil(2 * ((RISE_Z + POWER_Z) * usable / SMALLEST_RISE) ** 2)));
}
