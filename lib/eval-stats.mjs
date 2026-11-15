import os from 'node:os';
import { loadRunConfig } from '../skills/build/scripts/run-config.mjs';

const sum = (values) => values.reduce((total, value) => total + value, 0);

export const mean = (values) => sum(values) / values.length;

const squares = (values, centre) => sum(values.map((value) => (value - centre) ** 2));

function interval({ mean: centre, se, n, z }) {
  if (se === null) return { mean: centre, se: null, lo: null, hi: null, n };
  return { mean: centre, se, lo: centre - z * se, hi: centre + z * se, n };
}

function requireValues(values, name) {
  if (values.length === 0) throw new RangeError(`${name} needs at least one value`);
}

export function meanCi(values, z) {
  requireValues(values, 'meanCi');
  const n = values.length;
  const centre = mean(values);
  const se = n < 2 ? null : Math.sqrt(squares(values, centre) / (n - 1) / n);
  return interval({ mean: centre, se, n, z });
}

export const pairedDiff = (pairs, z) => meanCi(pairs.map(([base, cand]) => cand - base), z);

function sharedItems(best, candidate) {
  if (!best.items || !candidate.items) return [];
  return Object.keys(candidate.items).filter((id) => best.items[id]?.length > 0 && candidate.items[id].length > 0);
}

function pairedStats({ best, candidate, ids }) {
  const diffs = ids.map((id) => mean(candidate.items[id]) - mean(best.items[id]));
  const centre = mean(diffs);
  return { mode: 'paired', diff: centre, se: Math.sqrt(squares(diffs, centre) / (diffs.length - 1)) / Math.sqrt(diffs.length) };
}

export function pooledSd(groups, noiseSd = null) {
  const df = sum(groups.map((group) => group.length - 1));
  if (df > 0) return Math.sqrt(sum(groups.map((group) => squares(group, mean(group)))) / df);
  return noiseSd ?? null;
}

function runStats({ best, candidate, noiseSd }) {
  requireValues(best.runs, 'decideKeep best.runs');
  requireValues(candidate.runs, 'decideKeep candidate.runs');
  const sd = pooledSd([best.runs, candidate.runs], noiseSd);
  const se = sd === null ? null : sd * Math.sqrt(1 / best.runs.length + 1 / candidate.runs.length);
  return { mode: 'runs', diff: mean(candidate.runs) - mean(best.runs), se };
}

function compare({ best, candidate, noiseSd }) {
  const ids = sharedItems(best, candidate);
  return ids.length >= 2 ? pairedStats({ best, candidate, ids }) : runStats({ best, candidate, noiseSd });
}

function verdictFor({ diff, se, lo, n, floor, maxRuns }) {
  if (se === 0) return diff > floor ? ['keep', 'exact-gain'] : ['discard', 'no-gain'];
  if (diff <= floor) return ['discard', 'no-gain'];
  if (se === null) return n < maxRuns ? ['repeat', 'no-variance'] : ['discard', 'no-variance'];
  if (lo > floor) return ['keep', 'ci-above-floor'];
  return n < maxRuns ? ['repeat', 'noise'] : ['discard', 'noise'];
}

function requireSettings(settings) {
  const missing = Object.entries(settings).filter(([, value]) => value === undefined).map(([name]) => name);
  if (missing.length > 0) throw new TypeError(`decideKeep needs ${missing.join(', ')}`);
}

export function decideKeep({ best, candidate, z, floor, maxRuns, noiseSd }) {
  requireSettings({ z, floor, maxRuns });
  const { mode, diff, se } = compare({ best, candidate, noiseSd });
  const n = candidate.runs.length;
  const lo = se === null ? null : diff - z * se;
  const hi = se === null ? null : diff + z * se;
  const [verdict, reason] = verdictFor({ diff, se, lo, n, floor, maxRuns });
  return { verdict, mode, diff, se, lo, hi, n, reason };
}

export const evalDefaults = () => loadRunConfig({ home: os.homedir() }).defaults.eval;
