import fs from 'node:fs';
import path from 'node:path';
import { calibrationLines } from './judge-calibration.mjs';
import { aggregate } from './pressure-grade.mjs';

export function gradeSummary(gradesByCell, options = {}) {
  const { mode, ...aggregateOptions } = options;
  return Object.fromEntries(Object.entries(gradesByCell).map(([cell, runs]) => [cell, { mode, runs, cases: aggregate(runs, aggregateOptions) }]));
}

export function writeGrades(outDir, gradesByCell, options = {}) {
  const summary = gradeSummary(gradesByCell, options);
  fs.writeFileSync(path.join(outDir, 'grades.json'), `${JSON.stringify(summary, null, 2)}\n`);
  return deltaTable(summary);
}

export function gradeReport(outDir, gradesByCell, options = {}) {
  return [...writeGrades(outDir, gradesByCell, options), ...calibrationLines(['pressure-line'])];
}

export function deltaTable(summary) {
  const percent = (rate) => (rate === undefined ? 'n/a' : `${Math.round(rate * 100)}%`);
  const signed = (value) => `${value >= 0 ? '+' : ''}${Math.round(value * 100)}%`;
  const lines = Object.entries(summary).flatMap(([cell, { cases }]) => cases.map((result) => {
    const delta = result.delta === null ? 'n/a' : signed(result.delta);
    const compared = result.comparison ?? 'none';
    const interval = result.ci === null ? '' : ` ci [${signed(result.ci[0])}, ${signed(result.ci[1])}] margin ${Math.round(result.margin * 100)}%`;
    const needs = result.verdict !== 'INCONCLUSIVE' ? '' : (result.needed === null ? ' (more than 1000 runs per arm to decide)' : ` (${result.needed} runs per arm would decide at these rates)`);
    return `${cell} ${result.case}: with ${percent(result.rates.with)} ${compared} ${percent(result.rates[compared])} delta ${delta}${interval} ${result.verdict}${needs}${result.noSkillEffect ? ' no skill effect' : ''}`;
  }));
  const unstable = Object.entries(summary).flatMap(([cell, { runs }]) => runs.flatMap((grade) => grade.lines
    .filter((line) => line.unstable)
    .map((line) => `UNSTABLE JUDGE ${cell} ${grade.case} ${grade.arm} run ${grade.run}: votes ${line.votes.map((vote) => (vote ? 'PASS' : 'FAIL')).join('/')} on '${line.text}'`)));
  return [...lines, ...unstable];
}
