import { evalDefaults, meanCi } from './eval-stats.mjs';

const DEFAULTS = evalDefaults();

export const CALIBRATION_MIN_LABELS = DEFAULTS.calibrationMinLabels;
export const CALIBRATION_KAPPA_FLOOR = DEFAULTS.calibrationKappaFloor;
const CALIBRATION_Z = 1.96;
const UNKNOWN_VERDICT = 'UNKNOWN';

const normal = (value) => String(value).trim().toUpperCase();

export function parseJsonl(text) {
  return text.split('\n').filter((line) => line.trim() !== '').map((line, index) => {
    try {
      return JSON.parse(line);
    } catch {
      throw new Error(`line ${index + 1} is not JSON: ${line.slice(0, 80)}`);
    }
  });
}

const isSynthetic = (row) => row.synthetic === true || row.built !== undefined;

export function splitLabels(rows) {
  const labelled = rows.filter((row) => row.label !== null && row.label !== undefined && row.label !== '');
  return { human: labelled.filter((row) => !isSynthetic(row)), synthetic: labelled.filter(isSynthetic) };
}

export function cohenKappa(pairs, z = CALIBRATION_Z) {
  const n = pairs.length;
  if (n === 0) return { n, observed: null, expected: null, kappa: null, se: null, lo: null, hi: null };
  const observed = pairs.filter(([a, b]) => a === b).length / n;
  const categories = [...new Set(pairs.flat())];
  const share = (side, category) => pairs.filter((pair) => pair[side] === category).length / n;
  const expected = categories.reduce((sum, category) => sum + share(0, category) * share(1, category), 0);
  if (expected === 1) return { n, observed, expected, kappa: null, se: null, lo: null, hi: null };
  const kappa = (observed - expected) / (1 - expected);
  const se = Math.sqrt((observed * (1 - observed)) / (n * (1 - expected) ** 2));
  return { n, observed, expected, kappa, se, lo: kappa - z * se, hi: kappa + z * se };
}

export function agreement(pairs, z = CALIBRATION_Z) {
  const kappa = cohenKappa(pairs, z);
  if (pairs.length === 0) return { ...kappa, agree: 0, rate: null, rateLo: null, rateHi: null };
  const hits = pairs.map(([a, b]) => (a === b ? 1 : 0));
  const rate = meanCi(hits, z);
  return { ...kappa, agree: hits.reduce((sum, hit) => sum + hit, 0), rate: rate.mean, rateLo: rate.lo, rateHi: rate.hi };
}

function consensus(rows) {
  const byItem = new Map();
  for (const row of rows) {
    const key = `${row.dimension}\u0000${row.id}`;
    if (!byItem.has(key)) byItem.set(key, { id: row.id, dimension: row.dimension, labels: new Set(), labelers: new Set() });
    const item = byItem.get(key);
    item.labels.add(normal(row.label));
    item.labelers.add(row.labeler);
  }
  return [...byItem.values()];
}

export function pairVerdicts({ labels, verdicts, dimension }) {
  const wanted = consensus(labels.filter((row) => row.dimension === dimension));
  const judged = new Map(verdicts.filter((row) => row.dimension === dimension).map((row) => [row.id, normal(row.verdict)]));
  const pairs = [];
  let contested = 0;
  let unmatched = 0;
  let unknown = 0;
  for (const item of wanted) {
    if (item.labels.size > 1) { contested += 1; continue; }
    if (!judged.has(item.id)) { unmatched += 1; continue; }
    const verdict = judged.get(item.id);
    if (verdict === UNKNOWN_VERDICT) unknown += 1;
    pairs.push([[...item.labels][0], verdict]);
  }
  return { pairs, contested, unmatched, unknown, labelers: new Set(labels.flatMap((row) => (row.dimension === dimension ? [row.labeler] : []))).size };
}

export function calibrationStatus({ labels, verdicts, dimension, minLabels = CALIBRATION_MIN_LABELS, floor = CALIBRATION_KAPPA_FLOOR }) {
  const { human, synthetic } = splitLabels(labels.filter((row) => row.dimension === dimension));
  const paired = pairVerdicts({ labels: human, verdicts, dimension });
  const stats = agreement(paired.pairs);
  const detail = { ...stats, contested: paired.contested, unmatched: paired.unmatched, unknown: paired.unknown, labelers: paired.labelers, syntheticLabels: synthetic.length, humanLabels: human.length };
  if (human.length === 0) return { status: 'NO-LABELS', failing: false, reason: 'no human labels', ...detail };
  if (stats.n < minLabels) return { status: 'UNCALIBRATED', failing: false, reason: `${stats.n} paired human labels, ${minLabels} needed`, ...detail };
  if (stats.kappa === null) return { status: 'UNCALIBRATED', failing: true, reason: 'kappa undefined: one category on both sides', ...detail };
  if (stats.lo < floor) return { status: 'UNCALIBRATED', failing: true, reason: `kappa lower bound ${stats.lo.toFixed(2)} below ${floor}`, ...detail };
  return { status: 'CALIBRATED', failing: false, reason: `kappa lower bound ${stats.lo.toFixed(2)} at or above ${floor}`, ...detail };
}

const fixed = (value) => (value === null ? 'n/a' : value.toFixed(2));

export function statusLine({ judge, dimension, result }) {
  const kappa = `kappa ${fixed(result.kappa)} ci ${fixed(result.lo)}..${fixed(result.hi)} n ${result.n} agreement ${fixed(result.rate)}`;
  const extra = result.syntheticLabels > 0 ? ` synthetic_labels_unused ${result.syntheticLabels}` : '';
  return `${result.status} ${judge}/${dimension} ${kappa}${extra}`;
}
