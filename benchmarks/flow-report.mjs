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
import { meanAndSd } from './statistics.mjs';

const EXO_ARM = 'flow-c7';
const BASELINE_ARM = 'flow-base';

// The flow records of one out dir; a cell that has not finished has none.
export function readFlowRecords(outDir) {
  const records = [];
  for (const name of fs.readdirSync(outDir).sort()) {
    if (!name.startsWith('flow-')) continue;
    const file = path.join(outDir, name, 'record.json');
    if (!fs.existsSync(file)) continue;
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    // A record from before the sweep copied leadPeakTokens takes it from the cell's usage.json.
    const usageFile = path.join(outDir, name, 'usage.json');
    if (record.leadPeakTokens === undefined && fs.existsSync(usageFile)) record.leadPeakTokens = JSON.parse(fs.readFileSync(usageFile, 'utf8')).leadPeakTokens ?? null;
    if (record.kind === 'flow') records.push(record);
  }
  return records;
}

function mean(values) {
  return meanAndSd(values.filter((value) => typeof value === 'number')).mean;
}

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
    const checked = runs.filter((run) => typeof run.hiddenPass === 'boolean');
    const scored = runs.filter((run) => typeof run.landed === 'number' && typeof run.total === 'number' && run.total > 0);
    const defects = runs.filter((run) => Array.isArray(run.defects)).map((run) => run.defects.length);
    // A record from before the gate flags, or with no transcript, has none and drops out of their counts.
    const gated = runs.filter((run) => typeof run.verifyRan === 'boolean');
    const verified = gated.filter((run) => run.verifyRan);
    const routed = runs.filter((run) => Array.isArray(run.routes));
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
      passes: checked.filter((run) => run.hiddenPass).length,
      defectsTotal: sum(defects),
      defectsMean: mean(defects),
      tokensMean: mean(runs.map((run) => run.tokens)),
      costMean: mean(runs.map((run) => run.costUsd)),
      costTotal: sum(runs.map((run) => run.costUsd)),
      // Every record's spend over the hidden-check passes; null when none passes.
      costPerSuccess: checked.some((run) => run.hiddenPass) ? sum(runs.map((run) => run.costUsd)) / checked.filter((run) => run.hiddenPass).length : null,
      wallMeanMs: mean(runs.map((run) => run.wallMs)),
      gated: gated.length,
      verifyRan: verified.length,
      reviewDispatched: gated.filter((run) => run.reviewDispatched).length,
      routed: routed.length,
      routes,
      leadPeakMean: mean(runs.map((run) => run.leadPeakTokens)),
      leadPeakMax: runs.some((run) => typeof run.leadPeakTokens === 'number') ? Math.max(...runs.map((run) => run.leadPeakTokens).filter((value) => typeof value === 'number')) : null,
      verifiedTokensMean: mean(verified.map((run) => run.tokens)),
      verifiedCostMean: mean(verified.map((run) => run.costUsd)),
      verifiedWallMeanMs: mean(verified.map((run) => run.wallMs))
    };
  });
}

function rank(id) {
  if (id === EXO_ARM) return 0;
  return id === BASELINE_ARM ? 1 : 2;
}

// The pass-rate difference between two arms with two standard errors of it.
export function passDifference(exo, baseline) {
  if (exo === undefined || baseline === undefined || exo.checked === 0 || baseline.checked === 0) return null;
  const exoRate = exo.passes / exo.checked;
  const baselineRate = baseline.passes / baseline.checked;
  const standardError = Math.sqrt(exoRate * (1 - exoRate) / exo.checked + baselineRate * (1 - baselineRate) / baseline.checked);
  const difference = exoRate - baselineRate;
  return { difference, twoStandardErrors: 2 * standardError, better: difference > 2 * standardError };
}

function fixed(value, digits) {
  return value === null ? '-' : value.toFixed(digits);
}

function armLines(arm) {
  const landed = arm.landedFractionMean === null
    ? 'tasks landed -'
    : `tasks landed mean ${fixed(arm.landedFractionMean * 100, 0)}%, sum ${arm.landedSum}/${arm.totalSum}`;
  return [
    `${arm.id}: n=${arm.n}`,
    `  ${landed}`,
    `  hidden pass ${arm.passes}/${arm.checked}`,
    `  defects total ${arm.defectsTotal ?? '-'}, mean ${fixed(arm.defectsMean, 2)}`,
    `  weighted tokens mean ${fixed(arm.tokensMean, 0)}`,
    `  cost mean $${fixed(arm.costMean, 3)}, total $${fixed(arm.costTotal, 3)}`,
    `  cost per success ${arm.costPerSuccess === null ? 'none' : `$${fixed(arm.costPerSuccess, 3)}`}`,
    `  wall time mean ${fixed(arm.wallMeanMs === null ? null : arm.wallMeanMs / 60000, 1)} min`,
    `  verify ran ${arm.verifyRan}/${arm.gated}, review dispatched ${arm.reviewDispatched}/${arm.gated}`,
    `  route ${Object.entries(arm.routes).map(([label, count]) => `${label} ${count}`).join(', ') || '-'} (of ${arm.routed})`,
    `  lead peak tokens mean ${fixed(arm.leadPeakMean, 0)}, max ${arm.leadPeakMax ?? '-'}`,
    `  verify-ran cells: weighted tokens mean ${fixed(arm.verifiedTokensMean, 0)}, cost mean $${fixed(arm.verifiedCostMean, 3)}, wall time mean ${fixed(arm.verifiedWallMeanMs === null ? null : arm.verifiedWallMeanMs / 60000, 1)} min`
  ];
}

export function flowReport(records) {
  const arms = aggregateFlow(records);
  if (arms.length === 0) return 'No flow records found.';
  const lines = arms.flatMap(armLines);
  const comparison = passDifference(arms.find((arm) => arm.id === EXO_ARM), arms.find((arm) => arm.id === BASELINE_ARM));
  if (comparison === null) {
    lines.push(`Pass-rate difference (${EXO_ARM} minus ${BASELINE_ARM}): not computable, an arm has no hidden-check result.`, 'not better');
  } else {
    lines.push(
      `Pass-rate difference (${EXO_ARM} minus ${BASELINE_ARM}): ${fixed(comparison.difference, 3)}, 2 SE ${fixed(comparison.twoStandardErrors, 3)}`,
      comparison.better ? 'exo better' : 'not better'
    );
  }
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
