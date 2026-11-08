import os from 'node:os';
import { runDefaults } from '../skills/build/scripts/run-config.mjs';
import { compareMeans, meanAndSd } from '../benchmarks/statistics.mjs';

const DEFAULT_MIN_RISE = 0.1;
const BLOCKING = ['cost', 'wall'];
const METRICS = ['cost', 'wall', 'tokens'];
const BYPASS = /\b0\/\d+ Plan-task trailers/;

export function benchmarkMinRise(home = os.homedir()) {
  return runDefaults(home).benchmarkMinRise ?? DEFAULT_MIN_RISE;
}

function parseRow(line, row) {
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 9) return null;
  const detail = cells[8];
  return {
    row,
    cell: cells[0],
    tokens: Number(cells[5]),
    wall: Number.parseFloat(cells[6]),
    cost: Number.parseFloat(cells[7].replace('$', '')),
    detail,
    passed: detail.includes('hidden check pass'),
  };
}

export function parseResultRuns(markdown) {
  const runs = [];
  const tableLines = markdown.split('\n').filter((line) => line.startsWith('|'));
  for (const line of tableLines) {
    const run = parseRow(line, runs.length + 1);
    if (run && Number.isFinite(run.cost)) runs.push(run);
  }
  return runs;
}

export function splitFlowRuns(runs) {
  return {
    kept: runs.filter((run) => !BYPASS.test(run.detail)),
    bypassed: runs.filter((run) => BYPASS.test(run.detail)),
  };
}

function passRate(runs) {
  return runs.filter((run) => run.passed).length / runs.length;
}

function metricVerdict({ metric, base, cand, minRise }) {
  const before = base.map((run) => run[metric]);
  const after = cand.map((run) => run[metric]);
  const { diff, twoSeDiff, verdict } = compareMeans(before, after);
  const relative = diff / meanAndSd(before).mean;
  const beyondNoise = verdict === 'rise' || verdict === 'no SE (sd 0)';
  const rose = diff > 0 && beyondNoise && relative > minRise;
  const status = rose && BLOCKING.includes(metric) ? 'regression' : verdict;
  return { metric, diff, bound: twoSeDiff, relative, verdict: status };
}

function cellVerdict({ name, base, cand, minRise }) {
  const baseSplit = splitFlowRuns(base);
  const candSplit = splitFlowRuns(cand);
  const bypassed = { baseline: baseSplit.bypassed, candidate: candSplit.bypassed };
  const measured = baseSplit.kept.length >= 2 && candSplit.kept.length >= 2;
  if (!measured) return { cell: name, bypassed, status: 'unmeasured', metrics: [], passDrop: false };
  const metrics = METRICS.map((metric) => metricVerdict({ metric, base: baseSplit.kept, cand: candSplit.kept, minRise }));
  const passDrop = passRate(candSplit.kept) < passRate(baseSplit.kept);
  const regressed = passDrop || metrics.some((entry) => entry.verdict === 'regression');
  return { cell: name, bypassed, status: regressed ? 'regression' : 'ok', metrics, passDrop };
}

function groupByCell(runs) {
  const groups = new Map();
  for (const run of runs) groups.set(run.cell, [...(groups.get(run.cell) ?? []), run]);
  return groups;
}

export function compareToBaseline({ baseline, candidate, minRise = benchmarkMinRise() }) {
  const baseGroups = groupByCell(baseline);
  const candGroups = groupByCell(candidate);
  const names = [...new Set([...baseGroups.keys(), ...candGroups.keys()])];
  const cells = names.map((name) => cellVerdict({
    name,
    base: baseGroups.get(name) ?? [],
    cand: candGroups.get(name) ?? [],
    minRise,
  }));
  const blocked = cells.some((entry) => entry.status === 'regression' || entry.status === 'unmeasured');
  return { cells, blocked };
}

function describeMetric(entry) {
  const bound = entry.bound === null ? 'no bound' : `bound ${entry.bound.toFixed(3)}`;
  return `${entry.metric} ${entry.diff >= 0 ? '+' : ''}${entry.diff.toFixed(3)} (${bound}, ${(entry.relative * 100).toFixed(1)}%): ${entry.verdict}`;
}

function describeCell(entry) {
  const lines = [`- ${entry.cell}: ${entry.status}`];
  for (const metric of entry.metrics) lines.push(`  - Verdict: ${describeMetric(metric)}`);
  if (entry.passDrop) lines.push('  - Verdict: pass rate dropped: regression');
  return lines;
}

export function comparisonSection({ baselineLabel = 'none', result }) {
  const rows = (side, label) => result.cells.flatMap((entry) => entry.bypassed[side].map((run) => `${label} row ${run.row}`));
  const excluded = [...rows('baseline', 'baseline'), ...rows('candidate', 'candidate')];
  return [
    '## Comparison with the baseline',
    '',
    `Baseline: ${baselineLabel}`,
    `Excluded: ${excluded.length === 0 ? 'none' : excluded.join(', ')}`,
    '',
    ...result.cells.flatMap(describeCell),
  ];
}
