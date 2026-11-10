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

export function meanCi(values, z = 1.96) {
  requireValues(values, 'meanCi');
  const n = values.length;
  const centre = mean(values);
  const se = n < 2 ? null : Math.sqrt(squares(values, centre) / (n - 1) / n);
  return interval({ mean: centre, se, n, z });
}

export function median(values) {
  requireValues(values, 'median');
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mad(values) {
  const centre = median(values);
  return median(values.map((value) => Math.abs(value - centre)));
}

export const pairedDiff = (pairs, z = 1.96) => meanCi(pairs.map(([base, cand]) => cand - base), z);

function groupBy(rows) {
  const groups = new Map();
  for (const row of rows) groups.set(row.cluster, [...(groups.get(row.cluster) ?? []), row.value]);
  return [...groups.values()];
}

export function clusteredMeanCi(rows, z = 1.96) {
  requireValues(rows, 'clusteredMeanCi');
  const values = rows.map((row) => row.value);
  const groups = groupBy(rows);
  const n = values.length;
  const centre = mean(values);
  if (n < 2 || groups.length < 2) return { ...interval({ mean: centre, se: null, n, z }), clusters: groups.length };
  const within = squares(values, centre);
  const cross = sum(groups.map((group) => sum(group.map((value) => value - centre)) ** 2)) - within;
  const variance = within / (n - 1) / n + cross / n ** 2;
  return { ...interval({ mean: centre, se: Math.sqrt(Math.max(0, variance)), n, z }), clusters: groups.length };
}

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

export function decideKeep({ best, candidate, z, floor, maxRuns, noiseSd = null }) {
  requireSettings({ z, floor, maxRuns });
  const { mode, diff, se } = compare({ best, candidate, noiseSd });
  const n = candidate.runs.length;
  const lo = se === null ? null : diff - z * se;
  const hi = se === null ? null : diff + z * se;
  const [verdict, reason] = verdictFor({ diff, se, lo, n, floor, maxRuns });
  return { verdict, mode, diff, se, lo, hi, n, reason };
}

export const evalDefaults = (home = os.homedir()) => loadRunConfig({ home }).defaults.eval;

const DEFAULTS = evalDefaults();

export const TARGET_EFFECT = DEFAULTS.targetEffect;
export const ALPHA = DEFAULTS.alpha;
export const POWER = DEFAULTS.power;
const PAIRED_CORRELATION = DEFAULTS.pairedCorrelation;
const PLANNING_RATE = 0.5;

export function erfc(x) {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const poly = -z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806
    + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const value = t * Math.exp(poly);
  return x >= 0 ? value : 2 - value;
}

const normalCdf = (x) => erfc(-x / Math.SQRT2) / 2;

function requireProbability(value, name) {
  if (!(value > 0 && value < 1)) throw new RangeError(`${name} must lie strictly between 0 and 1, got ${value}`);
}

export function normalQuantile(probability) {
  requireProbability(probability, 'probability');
  let low = -10;
  let high = 10;
  for (let step = 0; step < 60; step++) {
    const middle = (low + high) / 2;
    if (normalCdf(middle) < probability) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

export function zSum({ alpha = ALPHA, power = POWER } = {}) {
  requireProbability(alpha, 'alpha');
  requireProbability(power, 'power');
  return normalQuantile(1 - alpha / 2) + normalQuantile(power);
}

function requirePositive(value, name) {
  if (!(value > 0)) throw new RangeError(`${name} must be above 0, got ${value}`);
}

export function designVariance({ omega2, sigma2 = 0, samples = 1 }) {
  requirePositive(samples, 'samples');
  return omega2 + 2 * sigma2 / samples;
}

export function tasksNeeded({ variance, effect = TARGET_EFFECT, alpha, power, z = zSum({ alpha, power }) }) {
  requirePositive(effect, 'effect');
  return Math.max(1, Math.ceil(z ** 2 * variance / effect ** 2));
}

export function detectableEffect({ variance, tasks, alpha, power, z = zSum({ alpha, power }) }) {
  requirePositive(tasks, 'tasks');
  return z * Math.sqrt(variance / tasks);
}

export function rateVariance({ rate = PLANNING_RATE, paired = false, correlation = PAIRED_CORRELATION }) {
  requireProbability(rate, 'rate');
  const unpaired = 2 * rate * (1 - rate);
  return { omega2: paired ? unpaired * (1 - correlation) : unpaired, sigma2: 0 };
}

const sampleVariance = (values) => (values.length < 2 ? 0 : squares(values, mean(values)) / (values.length - 1));

function taskMoments(values) {
  return { mean: mean(values), within: sampleVariance(values), samples: values.length };
}

const noise = ({ within, samples }) => within / samples;

function conditionalVariance(moments) {
  return Math.max(0, sampleVariance(moments.map((moment) => moment.mean)) - mean(moments.map(noise)));
}

function momentsOf(items, ids) {
  return ids.map((id) => taskMoments(items[id]));
}

function recordedIds(items) {
  return Object.keys(items).filter((id) => items[id]?.length > 0);
}

function requireTasks(ids, name) {
  if (ids.length < 2) throw new RangeError(`${name} needs scores for at least two tasks, got ${ids.length}`);
}

function pairedVariance(base, candidate) {
  const ids = recordedIds(base).filter((id) => candidate[id]?.length > 0);
  requireTasks(ids, 'a paired variance');
  const left = momentsOf(base, ids);
  const right = momentsOf(candidate, ids);
  const diffs = ids.map((_, at) => right[at].mean - left[at].mean);
  const noiseOfDiffs = ids.map((_, at) => noise(left[at]) + noise(right[at]));
  const omega2 = Math.max(0, sampleVariance(diffs) - mean(noiseOfDiffs));
  return { omega2, moments: [...left, ...right], tasks: ids.length };
}

function unpairedVariance(base, candidate) {
  const left = momentsOf(base, recordedIds(base));
  const right = momentsOf(candidate, recordedIds(candidate));
  requireTasks(left, 'an unpaired variance, base arm,');
  requireTasks(right, 'an unpaired variance, candidate arm,');
  return { omega2: conditionalVariance(left) + conditionalVariance(right), moments: [...left, ...right], tasks: Math.min(left.length, right.length) };
}

export function scoreVariance({ base, candidate, paired = false }) {
  const { omega2, moments, tasks } = paired ? pairedVariance(base, candidate) : unpairedVariance(base, candidate);
  return { omega2, sigma2: mean(moments.map((moment) => moment.within)), samples: mean(moments.map((moment) => moment.samples)), tasks };
}

export function planningVariance({ scores = null, samples = 1, ...rest }) {
  const parts = scores === null ? rateVariance(rest) : scoreVariance({ ...scores, paired: rest.paired });
  return designVariance({ omega2: parts.omega2, sigma2: parts.sigma2, samples });
}

export function powerLine({ tasks, samples = 1, arms = 2, effect = TARGET_EFFECT, alpha = ALPHA, power = POWER, ...design }) {
  requirePositive(tasks, 'tasks');
  const variance = planningVariance({ ...design, samples });
  const needed = tasksNeeded({ variance, effect, alpha, power });
  const floor = detectableEffect({ variance, tasks, alpha, power });
  const runs = tasks * samples * arms;
  return `power: ${tasks} tasks x ${samples} samples x ${arms} arms = ${runs} runs; an effect of ${effect} needs ${needed} tasks (alpha ${alpha}, power ${power}); MDE at ${tasks} tasks is ${floor.toFixed(3)}`;
}

function intervalVerdict({ lo, hi }) {
  if (lo > 0) return 'worse';
  if (hi < 0) return 'better';
  return 'not-shown';
}

export function judgeIdea({ pairs, checksPassed, scores = null, z = 1.96, ...design }) {
  const ci = pairedDiff(pairs, z);
  const verdict = checksPassed ? intervalVerdict(ci) : 'worse';
  const runs = scores === null ? null : powerLine({ ...design, tasks: Object.keys(scores.base).length, scores });
  return { verdict, ci, runs };
}
