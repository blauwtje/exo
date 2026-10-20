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
  // why: both arms at sd 0 give SE 0, so any difference would read as a rise or fall with no spread behind it.
  if (seDiff === 0 && diff !== 0) return { diff, twoSeDiff, verdict: 'no SE (sd 0)' };
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

export function signTest(pairs) {
  const decided = pairs.filter(([before, after]) => after !== before);
  const wins = decided.filter(([before, after]) => after > before).length;
  const n = decided.length;
  if (n === 0) return { wins, n, p: 1 };
  let tail = 0;
  let term = 1;
  for (let k = 0; k <= n; k++) {
    if (k >= wins) tail += term;
    term = term * (n - k) / (k + 1);
  }
  return { wins, n, p: tail / 2 ** n };
}

// Uncapped: a value above 1 - rate means no effect that size exists, so the run size detects nothing.
export function minDetectableEffect({ rate, n }) {
  return (RISE_Z + POWER_Z) * Math.sqrt(2 * rate * (1 - rate) / n);
}

export function minDetectableMeanEffect({ sd, n }) {
  return (RISE_Z + POWER_Z) * sd * Math.sqrt(2 / n);
}

function erfc(x) {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const poly = -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
    + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const value = t * Math.exp(poly);
  return x >= 0 ? value : 2 - value;
}

export function mannWhitney(a, b) {
  const n = a.length;
  const m = b.length;
  const all = [...a, ...b].sort((x, y) => x - y);
  const rank = new Map();
  let tieTerm = 0;
  for (let i = 0; i < all.length;) {
    let j = i;
    while (j < all.length && all[j] === all[i]) j++;
    rank.set(all[i], (i + j + 1) / 2);
    tieTerm += (j - i) ** 3 - (j - i);
    i = j;
  }
  const total = n + m;
  const u = a.reduce((sum, v) => sum + rank.get(v), 0) - n * (n + 1) / 2;
  const variance = n * m / 12 * (total + 1 - tieTerm / (total * (total - 1)));
  if (!(variance > 0)) return 1;
  return erfc(Math.abs(u - n * m / 2) / Math.sqrt(variance) / Math.SQRT2);
}
