import { meanCi, pairedDiff } from '../lib/eval-stats.mjs';
import { mean } from './basics.mjs';

const DIGITS = 3;

const isKnown = (value) => typeof value === 'number' && Number.isFinite(value);

const fixed = (value, digits) => value.toFixed(digits);

export function intervalText(interval, digits = DIGITS) {
  if (interval === null) return 'no data';
  if (interval.se === null) return `${fixed(interval.mean, digits)} no SE (n=${interval.n})`;
  return `${fixed(interval.mean, digits)} se ${fixed(interval.se, digits)} ci95 ${fixed(interval.lo, digits)}..${fixed(interval.hi, digits)} (n=${interval.n})`;
}

export function verdictWord(interval, { up = 'better', down = 'worse' } = {}) {
  if (interval === null || interval.se === null) return 'no SE';
  if (interval.lo > 0) return up;
  if (interval.hi < 0) return down;
  return 'noise';
}

export function knownMean(values) {
  const known = values.filter(isKnown);
  return { interval: known.length === 0 ? null : meanCi(known), excluded: values.length - known.length, total: values.length };
}

export function knownMeanText({ interval, excluded, total }, digits = DIGITS) {
  return `${intervalText(interval, digits)}, ${excluded} of ${total} excluded`;
}

export function pairedByCase(rows, pairOf) {
  const cases = new Map();
  for (const row of rows) {
    const [id, arm, value] = pairOf(row);
    const arms = cases.get(id) ?? new Map();
    arms.set(arm, [...(arms.get(arm) ?? []), value]);
    cases.set(id, arms);
  }
  return cases;
}

export function pairedArms(cases, base, candidate) {
  const pairs = [...cases.values()]
    .filter((arms) => arms.has(base) && arms.has(candidate))
    .map((arms) => [mean(arms.get(base)), mean(arms.get(candidate))]);
  return pairs.length === 0 ? null : pairedDiff(pairs);
}
