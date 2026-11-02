#!/usr/bin/env node
// benchmarks/flow-report.mjs
// Compares the exo flow arm (flow-c7) with the no-plugin baseline (flow-base)
// over the flow cells' record.json files of one or more sweep out dirs, one
// dir per run:
//
//   node benchmarks/flow-report.mjs <outDir>...
//
// Prints per arm the runs, tasks landed, hidden-check passes, defects, tokens,
// cost, cost per success, wall time, verify ran and review dispatched n/N,
// the next-task routes, lead peak tokens and the means over verify-ran cells
// (sweep.mjs records the flags), then the pass-rate difference exo minus baseline with
// two standard errors, and `exo better` only when the difference exceeds them.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { meanCi } from '../lib/eval-stats.mjs';

const EXO_ARM = ['flow-c7', 'flow-run'];
const BASELINE_ARM = 'flow-base';

const REPEAT_SUFFIX = /-\d+$/;

// The flow records of one out dir; a cell that has not finished has none, so it
// stands in as an unfinished record that counts as a failed run and measures nothing.
export function readFlowRecords(outDir) {
  const records = [];
  for (const name of fs.readdirSync(outDir).sort()) {
    if (!name.startsWith('flow-')) continue;
    const file = path.join(outDir, name, 'record.json');
    if (!fs.existsSync(file)) {
      records.push({ kind: 'flow', id: name.replace(REPEAT_SUFFIX, ''), unfinished: true });
      continue;
    }
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A record from before the sweep copied leadPeakTokens takes it from the cell's usage.json.
    const usageFile = path.join(outDir, name, 'usage.json');
    if (record.leadPeakTokens === undefined && fs.existsSync(usageFile)) record.leadPeakTokens = JSON.parse(fs.readFileSync(usageFile, 'utf8')).leadPeakTokens ?? null;
    if (record.kind === 'flow') records.push(record);
  }
  return records;
}

const isNumber = (value) => typeof value === 'number';

function mean(values) {
  const numbers = values.filter(isNumber);
  return numbers.length === 0 ? null : meanCi(numbers).mean;
}

const measuredRun = (run) => run.unfinished !== true && run.timedOut !== true;

function stat(runs, read) {
  const numbers = runs.filter(measuredRun).map(read).filter(isNumber);
  const excluded = runs.length - numbers.length;
  if (numbers.length === 0) return { mean: null, se: null, n: 0, excluded };
  const { mean: centre, se } = meanCi(numbers);
  return { mean: centre, se, n: numbers.length, excluded };
}

const failedRun = (run) => run.unfinished === true || run.timedOut === true;
const hasHiddenResult = (run) => failedRun(run) || typeof run.hiddenPass === 'boolean';
const passedRun = (run) => !failedRun(run) && run.hiddenPass === true;

function sum(values) {
  const numbers = values.filter((value) => typeof value === 'number');
  return numbers.length === 0 ? null : numbers.reduce((total, value) => total + value, 0);
}

// One summary per arm, the exo arm and the baseline first. A record from before the hidden check has no
// landed, hiddenPass or defects and drops out of those figures only.
export function aggregateFlow(records) {
  const byArm = new Map();
  for (const record of records) {
    if (!byArm.has(record.id)) byArm.set(record.id, []);
    byArm.get(record.id).push(record);
  }
  const ids = [...byArm.keys()].sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
  return ids.map((id) => {
    const runs = byArm.get(id);
    const checked = runs.filter(hasHiddenResult);
    const scored = runs.filter((run) => measuredRun(run) && typeof run.landed === 'number' && typeof run.total === 'number' && run.total > 0);
    const defects = runs.filter((run) => measuredRun(run) && Array.isArray(run.defects)).map((run) => run.defects.length);
    // A record from before the gate flags, or with no transcript, has none and drops out of their counts.
    const gated = runs.filter((run) => measuredRun(run) && typeof run.verifyRan === 'boolean');
    const verified = gated.filter((run) => run.verifyRan);
    const routed = runs.filter((run) => measuredRun(run) && Array.isArray(run.routes));
    const routes = {};
    for (const run of routed) {
      const label = [...new Set(run.routes)].join('+') || 'none';
      routes[label] = (routes[label] ?? 0) + 1;
    }
    return {
      id,
      n: runs.length,
      checked: checked.length,
      landedFractionMean: mean(scored.map((run) => run.landed / run.total)),
      landedSum: sum(scored.map((run) => run.landed)),
      totalSum: sum(scored.map((run) => run.total)),
      passes: checked.filter(passedRun).length,
      failed: runs.filter(failedRun).length,
      defectsTotal: sum(defects),
      defectsMean: mean(defects),
      tokens: stat(runs, (run) => run.tokens),
      cost: stat(runs, (run) => run.costUsd),
      costTotal: sum(runs.map((run) => run.costUsd)),
      costPerSuccess: checked.some(passedRun) ? sum(runs.map((run) => run.costUsd)) / checked.filter(passedRun).length : null,
      wall: stat(runs, (run) => run.wallMs),
      gated: gated.length,
      verifyRan: verified.length,
      reviewDispatched: gated.filter((run) => run.reviewDispatched).length,
      routed: routed.length,
      routes,
      leadPeak: stat(runs, (run) => run.leadPeakTokens),
      leadPeakMax: runs.some((run) => isNumber(run.leadPeakTokens)) ? Math.max(...runs.map((run) => run.leadPeakTokens).filter(isNumber)) : null,
      verifiedTokens: stat(verified, (run) => run.tokens),
      verifiedCost: stat(verified, (run) => run.costUsd),
      verifiedWall: stat(verified, (run) => run.wallMs)
    };
  });
}

function rank(id) {
  if (EXO_ARM.includes(id)) return 0;
  return id === BASELINE_ARM ? 1 : 2;
}

const MIN_RUNS_FOR_SE = 2;
const RISE_Z = 2;

export function passDifference(exo, baseline) {
  if (exo === undefined || baseline === undefined || exo.checked === 0 || baseline.checked === 0) return null;
  const exoRate = (exo.passes + 1) / (exo.checked + 2);
  const baselineRate = (baseline.passes + 1) / (baseline.checked + 2);
  const standardError = Math.sqrt(exoRate * (1 - exoRate) / (exo.checked + 2) + baselineRate * (1 - baselineRate) / (baseline.checked + 2));
  const difference = exo.passes / exo.checked - baseline.passes / baseline.checked;
  const adjustedDifference = exoRate - baselineRate;
  const twoStandardErrors = RISE_Z * standardError;
  const noSe = Math.min(exo.checked, baseline.checked) < MIN_RUNS_FOR_SE;
  return { difference, adjustedDifference, standardError, twoStandardErrors, noSe, better: !noSe && adjustedDifference > twoStandardErrors };
}

function fixed(value, digits) {
  return value === null ? '-' : value.toFixed(digits);
}

function withError(stat, { digits = 0, scale = 1, prefix = '', unit = '' } = {}) {
  const counts = `n=${stat.n}, excluded ${stat.excluded}`;
  if (stat.mean === null) return `- (${counts})`;
  const error = stat.se === null ? 'no SE' : `±${prefix}${fixed(stat.se / scale, digits)}${unit} SE`;
  return `${prefix}${fixed(stat.mean / scale, digits)}${unit} ${error} (${counts})`;
}

const MINUTES = { digits: 1, scale: 60000, unit: ' min' };
const DOLLARS = { digits: 3, prefix: '$' };

function armLines(arm, baseline) {
  const landed = arm.landedFractionMean === null
    ? 'tasks landed -'
    : `tasks landed mean ${fixed(arm.landedFractionMean * 100, 0)}%, sum ${arm.landedSum}/${arm.totalSum}`;
  return [
    `${arm.id}: n=${arm.n}`,
    `  ${landed}`,
    `  hidden pass ${arm.passes}/${arm.checked} (${arm.failed} timed out or unfinished, counted as failures)`,
    `  defects total ${arm.defectsTotal ?? '-'}, mean ${fixed(arm.defectsMean, 2)}`,
    `  weighted tokens mean ${withError(arm.tokens)}`,
    ...(EXO_ARM.includes(arm.id) && baseline?.tokens.mean ? [`  weighted tokens ${fixed(arm.tokens.mean / baseline.tokens.mean, 2)}x ${BASELINE_ARM}, hidden check ${arm.passes}/${arm.checked}`] : []),
    `  cost mean ${withError(arm.cost, DOLLARS)}, total $${fixed(arm.costTotal, 3)}`,
    `  cost per success ${arm.costPerSuccess === null ? 'none' : `$${fixed(arm.costPerSuccess, 3)}`}`,
    `  wall time mean ${withError(arm.wall, MINUTES)}`,
    `  verify ran ${arm.verifyRan}/${arm.gated}, review dispatched ${arm.reviewDispatched}/${arm.gated}`,
    `  route ${Object.entries(arm.routes).map(([label, count]) => `${label} ${count}`).join(', ') || '-'} (of ${arm.routed})`,
    `  lead peak tokens mean ${withError(arm.leadPeak)}, max ${arm.leadPeakMax ?? '-'}`,
    `  verify-ran cells: weighted tokens mean ${withError(arm.verifiedTokens)}, cost mean ${withError(arm.verifiedCost, DOLLARS)}, wall time mean ${withError(arm.verifiedWall, MINUTES)}`
  ];
}

function differenceLine(id, comparison) {
  const error = comparison.noSe ? 'no SE (an arm has under 2 checked runs)' : `SE ${fixed(comparison.standardError, 3)}, 2 SE ${fixed(comparison.twoStandardErrors, 3)}`;
  return `Pass-rate difference (${id} minus ${BASELINE_ARM}): ${fixed(comparison.difference, 3)}; Agresti-Caffo ${fixed(comparison.adjustedDifference, 3)}, ${error}`;
}

function verdictLine(compared) {
  if (compared.some(([, comparison]) => comparison.better)) return 'exo better';
  if (compared.every(([, comparison]) => comparison.noSe)) return 'no verdict (no SE)';
  return 'not better';
}

export function flowReport(records) {
  const arms = aggregateFlow(records);
  if (arms.length === 0) return 'No flow records found.';
  const baseline = arms.find((arm) => arm.id === BASELINE_ARM);
  const lines = arms.flatMap((arm) => armLines(arm, baseline));
  const compared = arms.filter((arm) => EXO_ARM.includes(arm.id)).map((arm) => [arm.id, passDifference(arm, baseline)]).filter(([, comparison]) => comparison !== null);
  if (compared.length === 0) {
    lines.push(`Pass-rate difference (${EXO_ARM[0]} minus ${BASELINE_ARM}): not computable, an arm has no hidden-check result.`, 'not better');
    return lines.join('\n');
  }
  for (const [id, comparison] of compared) lines.push(differenceLine(id, comparison));
  lines.push(verdictLine(compared));
  return lines.join('\n');
}

function main(argv) {
  if (argv.length === 0) {
    console.error('usage: node benchmarks/flow-report.mjs <outDir>...');
    return 2;
  }
  const records = argv.flatMap((outDir) => readFlowRecords(path.resolve(outDir)));
  console.log(flowReport(records));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
