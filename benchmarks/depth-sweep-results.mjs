import { median } from '../lib/eval-stats.mjs';

const BASELINE_ARM = 'flow-unit';
export const NEW_ARMS = ['flow-direct', 'flow-nofork'];
export const ARMS = [BASELINE_ARM, ...NEW_ARMS];
const HOPS = ['main', 'coordinator', 'workers'];
const RESAMPLES = 2000;

function randomSource(seed) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function pairedBootstrap(pairs) {
  if (pairs.length < 2) return null;
  const random = randomSource(1);
  const diffs = Array.from({ length: RESAMPLES }, () => {
    const sample = pairs.map(() => pairs[Math.floor(random() * pairs.length)]);
    return median(sample.map(([, candidate]) => candidate)) - median(sample.map(([base]) => base));
  });
  diffs.sort((left, right) => left - right);
  return { lo: diffs[Math.floor(RESAMPLES * 0.025)], hi: diffs[Math.floor(RESAMPLES * 0.975)] };
}

const finite = (values) => values.filter((value) => Number.isFinite(value));

function medianText(values, format = String) {
  const known = finite(values);
  return known.length === 0 ? '-' : format(median(known));
}

function armSummary(runs) {
  const hops = HOPS.map((hop) => `${hop} ${medianText(runs.map((run) => run.hopPeakTokens?.[hop]))}`);
  const passed = runs.filter((run) => run.hiddenPass === true).length;
  const wall = medianText(runs.map((run) => run.wallMs), (ms) => Math.round(ms / 1000));
  const cost = medianText(runs.map((run) => run.costUsd), (usd) => usd.toFixed(3));
  return `n=${runs.length}, median wall ${wall} s, median cost $${cost}, pass ${passed}/${runs.length}, peak tokens per hop: ${hops.join(', ')}`;
}

function pairedLine({ arm, metric, records }) {
  const base = records.filter((run) => run.arm === BASELINE_ARM);
  const pairs = records
    .filter((run) => run.arm === arm)
    .map((run) => [base.find((other) => other.index === run.index), run])
    .filter(([other]) => other !== undefined)
    .map(([other, run]) => [other[metric], run[metric]])
    .filter((pair) => pair.every(Number.isFinite));
  const interval = pairedBootstrap(pairs);
  if (interval === null) return `- ${arm} minus ${BASELINE_ARM}, ${metric}: fewer than 2 pairs`;
  return `- ${arm} minus ${BASELINE_ARM}, ${metric}: 95% bootstrap interval of the median difference ${interval.lo.toFixed(3)} to ${interval.hi.toFixed(3)} (n=${pairs.length})`;
}

export function resultsText({ records, stopReason }) {
  const arms = ARMS.map((arm) => `- ${arm}: ${armSummary(records.filter((run) => run.arm === arm))}`);
  const paired = NEW_ARMS.flatMap((arm) => ['wallMs', 'costUsd'].map((metric) => pairedLine({ arm, metric, records })));
  const spent = finite(records.map((run) => run.costUsd)).reduce((sum, cost) => sum + cost, 0);
  return ['# Depth sweep', '', stopReason ?? 'Finished.', `Spent $${spent.toFixed(2)}.`, '', '## Arms', '', ...arms, '', '## Paired', '', ...paired, ''].join('\n');
}
