import fs from 'node:fs';
import path from 'node:path';
import { meanCi, pairedDiff } from '../../lib/eval-stats.mjs';

export const BAND = { low: 0.1, high: 0.9 };
const SERIOUS_GRADES = new Set(['fail', 'unknown', 'leak']);

const isKnown = (value) => typeof value === 'number' && Number.isFinite(value);

export function isAborted(result) {
  if (result.timedOut === true || result.is_error === true) return true;
  return result.exitCode !== undefined && result.exitCode !== 0;
}

export function cellRecord({ caseId, kind, grade, result }) {
  const aborted = isAborted(result);
  return {
    caseId,
    kind,
    grade,
    aborted,
    costUsd: isKnown(result.total_cost_usd) ? result.total_cost_usd : null,
    wallMs: isKnown(result.wallMs) ? result.wallMs : null
  };
}

export function stoppedRecord({ caseId, kind }) {
  return { caseId, kind, grade: 'fail', aborted: true, costUsd: null, wallMs: null };
}

export function readCellRecord(cellDirectory, caseId, kind) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(cellDirectory, name), 'utf8'));
  const gradeFile = path.join(cellDirectory, 'grade.json');
  if (!fs.existsSync(gradeFile)) return null;
  const resultFile = path.join(cellDirectory, 'result.json');
  const result = fs.existsSync(resultFile) ? read('result.json') : { is_error: true };
  return cellRecord({ caseId, kind, grade: read('grade.json').grade, result });
}

export function failureValue(cell) {
  return cell.aborted || SERIOUS_GRADES.has(cell.grade) ? 1 : 0;
}

export function measure(values) {
  const known = values.filter(isKnown);
  const excluded = values.length - known.length;
  if (known.length === 0) return { mean: null, se: null, n: 0, excluded };
  const { mean, se, n } = meanCi(known);
  return { mean, se, n, excluded };
}

const seconds = (milliseconds) => (isKnown(milliseconds) ? milliseconds / 1000 : null);

export function formatMeasure(stat, digits = 3, alsoExcluded = 0) {
  const excluded = stat.excluded + alsoExcluded;
  if (stat.mean === null) return `n/a n 0 excluded ${excluded}`;
  const spread = stat.se === null ? 'no SE' : `se ${stat.se.toFixed(digits)}`;
  return `${stat.mean.toFixed(digits)} ${spread} n ${stat.n} excluded ${excluded}`;
}

export function failureRate(cells) {
  return measure(cells.map(failureValue));
}

export function inBand(rate) {
  return rate >= BAND.low && rate <= BAND.high;
}

function casesOf(cells) {
  return [...new Set(cells.map((cell) => cell.caseId))];
}

function ratesByCase(cells) {
  return new Map(casesOf(cells).map((caseId) => [caseId, failureRate(cells.filter((cell) => cell.caseId === caseId)).mean]));
}

function verdictOf(interval) {
  if (interval.se === null) return 'no SE';
  if (interval.lo > 0) return 'worse';
  if (interval.hi < 0) return 'better';
  return 'noise';
}

export function compareArms({ base, candidate }) {
  const baseRates = ratesByCase(base);
  const pairs = [...ratesByCase(candidate)]
    .filter(([caseId]) => baseRates.has(caseId))
    .map(([caseId, rate]) => [baseRates.get(caseId), rate]);
  if (pairs.length === 0) return null;
  const interval = pairedDiff(pairs);
  return { ...interval, verdict: verdictOf(interval) };
}

export function formatComparison(name, comparison) {
  const band = comparison.lo === null ? '' : ` 95% CI [${comparison.lo.toFixed(3)}, ${comparison.hi.toFixed(3)}]`;
  const spread = comparison.se === null ? 'no SE' : `se ${comparison.se.toFixed(3)}`;
  return `vs ${name}\tfail rate diff ${comparison.mean.toFixed(3)} ${spread}${band} paired over ${comparison.n} cases\tverdict ${comparison.verdict}`;
}

function caseLine(caseId, cells) {
  const rate = failureRate(cells);
  const unknown = cells.filter((cell) => cell.grade === 'unknown' || cell.grade === 'leak').length;
  const aborted = cells.filter((cell) => cell.aborted).length;
  const fails = cells.filter((cell) => failureValue(cell) === 1).length;
  const notes = [unknown ? `${unknown} unknown/leak` : null, aborted ? `${aborted} aborted` : null].filter(Boolean).join(', ');
  return `${caseId}\t${cells[0].kind ?? '?'}\t${fails}/${cells.length} fail${notes ? ` (${notes}, counted as failures)` : ''}\tfail rate ${formatMeasure(rate)}\t${inBand(rate.mean) ? 'IN' : 'outside'} 10-90% band`;
}

export function summaryLines({ cells, others = {} }) {
  if (cells.length === 0) return [];
  const finished = cells.filter((cell) => !cell.aborted);
  const lines = casesOf(cells).map((caseId) => caseLine(caseId, cells.filter((cell) => cell.caseId === caseId)));
  lines.push(`all cells\tfail rate ${formatMeasure(failureRate(cells))}`);
  const excluded = cells.length - finished.length;
  lines.push(`cost usd per finished cell ${formatMeasure(measure(finished.map((cell) => cell.costUsd)), 3, excluded)}`);
  lines.push(`wall s per finished cell ${formatMeasure(measure(finished.map((cell) => seconds(cell.wallMs))), 1, excluded)}`);
  for (const [name, otherCells] of Object.entries(others)) {
    const comparison = compareArms({ base: otherCells, candidate: cells });
    if (comparison !== null) lines.push(formatComparison(name, comparison));
  }
  return lines;
}
