import { pairedDiff } from '../lib/eval-stats.mjs';
import { sum } from './basics.mjs';
import { BEFORE_ARM } from './plugin-copies.mjs';
import { wilson } from './routing-stats.mjs';
import { RISE_Z, meanAndSd } from './statistics.mjs';

export const METRICS = ['wallMs', 'total_cost_usd', 'modelTurns', 'pass'];
export const SUMMARY_ARMS = { before: BEFORE_ARM, after: 'exo' };

export function cellFailed(record) {
  if (record.timedOut === true) return true;
  return record.resultSubtype !== undefined && record.resultSubtype !== 'success';
}

function metricValues(records, metric) {
  if (metric === 'pass') return records.map((record) => Number(record.pass === true && !cellFailed(record)));
  const values = records.filter((record) => !cellFailed(record)).map((record) => record[metric]);
  return values.filter((value) => typeof value === 'number');
}

function share(records, predicate) {
  return records.length === 0 ? null : records.filter(predicate).length / records.length;
}

export function armStats(records) {
  const failed = records.filter(cellFailed).length;
  const passes = metricValues(records, 'pass').filter((value) => value === 1).length;
  const stats = { n: records.length, failed, passWilson: wilson(passes, records.length), bisectRanRate: share(records, (record) => record.bisectRan === true), skillFiredRate: share(records, (record) => record.skillFired === true) };
  for (const metric of METRICS) stats[metric] = meanAndSd(metricValues(records, metric));
  return stats;
}

export function verdictOf(sumDiff, se) {
  if (se === null) return 'no SE';
  if (sumDiff > RISE_Z * se) return 'rise';
  if (sumDiff < -RISE_Z * se) return 'fall';
  return 'noise';
}

function pairedStats(entries, metric, arms) {
  return entries
    .map((entry) => [entry.arms[arms.before]?.[metric], entry.arms[arms.after]?.[metric]])
    .filter(([before, after]) => before !== undefined && after !== undefined && before.n > 0 && after.n > 0);
}

function pairedCaseError(pairs) {
  if (pairs.length < 2) return null;
  const { se } = pairedDiff(pairs.map(([before, after]) => [before.mean, after.mean]));
  return se === null ? null : se * pairs.length;
}

function pooledError(pairs) {
  if (!pairs.every(([before, after]) => before.n >= 2 && after.n >= 2)) return pairedCaseError(pairs);
  return Math.sqrt(sum(pairs.map(([before, after]) => before.sd ** 2 / before.n + after.sd ** 2 / after.n)));
}

export function poolMetric(entries, metric, arms = SUMMARY_ARMS) {
  const pairs = pairedStats(entries, metric, arms);
  if (pairs.length === 0) return null;
  const sumBefore = sum(pairs.map(([before]) => before.mean));
  const sumAfter = sum(pairs.map(([, after]) => after.mean));
  const sumDiff = sumAfter - sumBefore;
  const se = pooledError(pairs);
  const scaled = sumBefore === 0;
  return {
    cases: pairs.length,
    sumBefore,
    sumAfter,
    sumDiff,
    relative: scaled ? null : sumDiff / sumBefore,
    se,
    lo: se === null ? null : sumDiff - RISE_Z * se,
    hi: se === null ? null : sumDiff + RISE_Z * se,
    band: se === null || scaled ? null : RISE_Z * se / sumBefore,
    verdict: verdictOf(sumDiff, se)
  };
}

function poolGroup(entries, arms) {
  return Object.fromEntries(METRICS.map((metric) => [metric, poolMetric(entries, metric, arms)]));
}

function groupBy(records, key) {
  const groups = new Map();
  for (const record of records) groups.set(record[key], [...(groups.get(record[key]) ?? []), record]);
  return groups;
}

function caseEntry(records) {
  const arms = [...groupBy(records, 'arm')].map(([arm, armRecords]) => [arm, armStats(armRecords)]);
  return { kind: records[0].kind, arms: Object.fromEntries(arms) };
}

export function summarize(records, shas, promptMode, arms = SUMMARY_ARMS) {
  const cases = Object.fromEntries([...groupBy(records, 'case')].map(([name, caseRecords]) => [name, caseEntry(caseRecords)]));
  const entries = Object.values(cases);
  return {
    beforeSha: shas.before,
    afterSha: shas.after,
    promptMode,
    cells: records.length,
    cases,
    pooled: {
      regression: poolGroup(entries.filter((entry) => entry.kind === 'regression'), arms),
      controls: poolGroup(entries.filter((entry) => entry.kind !== 'regression'), arms)
    }
  };
}

function format(stat, scale = 1, digits = 2) {
  if (stat.mean === null) return 'n/a';
  const spread = stat.sd === null ? 'n/a' : (stat.sd / scale).toFixed(digits);
  return `${(stat.mean / scale).toFixed(digits)}±${spread}`;
}

function percent(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function wilsonText(interval) {
  return interval ? ` [${percent(interval[0])}-${percent(interval[1])}]` : '';
}

function armLine(name, kind, arm, stats) {
  const cells = [
    name.padEnd(28), kind.padEnd(12), arm.padEnd(10), `n=${stats.n}`,
    `wall ${format(stats.wallMs, 1000, 1)}s`,
    `cost $${format(stats.total_cost_usd)}`,
    `turns ${format(stats.modelTurns, 1, 1)}`,
    `pass ${percent(stats.pass.mean)}${wilsonText(stats.passWilson)}`,
    `bisect ${percent(stats.bisectRanRate)}`,
    `skill ${percent(stats.skillFiredRate)}`,
    `failed ${stats.failed ?? 0} of ${stats.n}, left out of wall, cost and turns`
  ];
  return cells.join('  ');
}

function pooledLine(group, metric, pooled) {
  if (pooled === null) return `pooled ${group} ${metric}: no paired cases`;
  const band = pooled.band === null ? 'n/a' : `±${percent(pooled.band)}`;
  const spread = pooled.se === null ? 'no SE' : `se ${pooled.se.toFixed(2)} ci ${pooled.lo.toFixed(2)}..${pooled.hi.toFixed(2)}`;
  return `pooled ${group} ${metric}: before ${pooled.sumBefore.toFixed(2)} after ${pooled.sumAfter.toFixed(2)} Σd ${pooled.sumDiff.toFixed(2)} ${spread} over ${pooled.cases} cases, relative ${percent(pooled.relative)} band ${band} ${pooled.verdict}`;
}

export function summaryLines(summary) {
  const lines = [`prompt ${summary.promptMode}, before ${summary.beforeSha} after ${summary.afterSha}, ${summary.cells} cells`];
  for (const [name, entry] of Object.entries(summary.cases)) {
    for (const [arm, stats] of Object.entries(entry.arms)) lines.push(armLine(name, entry.kind, arm, stats));
  }
  for (const [group, metrics] of Object.entries(summary.pooled)) {
    for (const metric of METRICS) lines.push(pooledLine(group, metric, metrics[metric]));
  }
  return lines;
}
