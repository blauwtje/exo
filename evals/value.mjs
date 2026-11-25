#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { isMain } from '#script-flags';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TABLE = path.join(ROOT, 'evals', 'value.md');
const BUDGET_USD = 40;
const CASE_USD = 1.9;
const COLUMNS = ['part', 'cases', 'share', 'order', 'paths', 'with', 'without', 'cost with', 'cost without', 'date', 'verdict'];
const USAGE = 'usage: value.mjs --plan | --run [part]';
const FIGURES = ['with', 'without', 'cost with', 'cost without', 'date'];

const cells = (line) => line.split('|').slice(1, -1).map((cell) => cell.trim());
const rowLine = (row) => `| ${COLUMNS.map((name) => row[name]).join(' | ')} |`;
const caseNames = (row) => row.cases.split(',');
const shareOf = (row) => Math.round(caseNames(row).length * CASE_USD * 100) / 100;

function headerIndex(lines) {
  const start = lines.findIndex((line) => line.startsWith('| part |'));
  if (start === -1) throw new Error('evals/value.md has no "| part |" header row');
  return start;
}

export function readRows(text) {
  const lines = text.split('\n');
  const start = headerIndex(lines);
  const body = lines.slice(start + 2);
  const end = body.findIndex((line) => !line.startsWith('|'));
  return body.slice(0, end === -1 ? undefined : end).map((line) => Object.fromEntries(cells(line).map((value, index) => [COLUMNS[index], value])));
}

export function writeRows(text, rows) {
  const lines = text.split('\n');
  const start = headerIndex(lines);
  const body = lines.slice(start + 2);
  const end = body.findIndex((line) => !line.startsWith('|'));
  const tail = end === -1 ? [] : body.slice(end);
  return [...lines.slice(0, start + 2), ...rows.map(rowLine), ...tail].join('\n');
}

export function plannedOrder(rows) {
  return [...rows].sort((left, right) => shareOf(left) - shareOf(right) || left.part.localeCompare(right.part));
}

export function planBudget(rows, budget = BUDGET_USD) {
  let left = budget;
  return plannedOrder(rows).map((row) => {
    const fits = shareOf(row) <= left;
    if (fits) left -= shareOf(row);
    return { part: row.part, share: shareOf(row), fits, left };
  });
}

function planProblems(rows, evalNames) {
  const problems = [];
  const assigned = rows.flatMap(caseNames);
  for (const name of evalNames) {
    const count = assigned.filter((caseName) => caseName === name).length;
    if (count !== 1) problems.push(`case ${name} is assigned to ${count} parts`);
  }
  for (const name of assigned) {
    if (!evalNames.includes(name)) problems.push(`case ${name} does not exist`);
  }
  plannedOrder(rows).forEach((row, index) => {
    if (Number(row.order) !== index + 1) problems.push(`part ${row.part} has order ${row.order}, expected ${index + 1}`);
    if (Number(row.share) !== shareOf(row)) problems.push(`part ${row.part} has share ${row.share}, expected ${shareOf(row)}`);
  });
  return problems;
}

function evalCaseNames() {
  return fs.readdirSync(path.join(ROOT, 'evals'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'results')
    .map((entry) => entry.name);
}

export function unmeasuredParts(rows) {
  const fitting = planBudget(rows).filter((step) => step.fits).map((step) => step.part);
  return fitting.filter((name) => FIGURES.some((figure) => rows.find((row) => row.part === name)[figure] === '-'));
}

function runCost(run) {
  return (run.costUsd ?? 0) + (run.judgeCostUsd ?? 0);
}

const isCut = (run) => run.skippedPaidGraders || run.costUsd === undefined;

export function needsThird(testCase) {
  return ['with', 'without'].some((arm) => {
    const runs = Object.values(testCase.arms?.[arm] ?? {});
    return runs.length === 2 && !runs.some(isCut) && runs[0].passed !== runs[1].passed;
  });
}

export function mergeRuns(first, extra) {
  return first.map((testCase) => {
    const added = extra.find((candidate) => candidate.name === testCase.name);
    if (!added) return testCase;
    const arms = Object.fromEntries(Object.entries(testCase.arms ?? {}).map(([arm, runs]) => [
      arm,
      { ...runs, ...Object.fromEntries(Object.entries(added.arms?.[arm] ?? {}).map(([key, run]) => [`third-${key}`, run])) },
    ]));
    return { ...testCase, arms };
  });
}

export function armFigures(cases, arm) {
  const runs = cases.map((testCase) => Object.values(testCase.arms?.[arm] ?? {}));
  const cut = runs.flat().filter(isCut).length;
  const costless = runs.flat().some((run) => run.costUsd === undefined);
  const cost = costless ? '-' : runs.flat().reduce((sum, run) => sum + runCost(run), 0);
  const passed = runs.filter((caseRuns) => caseRuns.filter((run) => run.passed && !isCut(run)).length * 2 > caseRuns.length).length;
  return { passed, cost, cut };
}

export function runTally(cases, arm) {
  const runs = cases.flatMap((testCase) => Object.values(testCase.arms?.[arm] ?? {}));
  return { passed: runs.filter((run) => run.passed && !isCut(run)).length, total: runs.length };
}

export function verdictOf(withExo, without) {
  const unsure = withExo.cut > 0 || without.cut > 0 || withExo.cost === '-' || without.cost === '-' || (withExo.passed === 0 && without.passed === 0);
  if (unsure) return 'not sure yet';
  if (withExo.passed === without.passed) return 'same';
  return withExo.passed > without.passed ? 'better' : 'worse';
}

function evalRuns(name, maxCost, runs) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'value-'));
  const jsonPath = path.join(directory, 'result.json');
  const args = [
    'plugin', 'eval', '--case', name, '--scaffold', '--allow-tools', 'Bash', 'Edit', 'Write',
    '--runs', String(runs), '--concurrency', '8', '--judge-model', 'sonnet', '--ablation', 'with-without',
    '--json', jsonPath, '--output-dir', path.join(directory, 'out'), '--max-cost-usd', String(maxCost), '--no-publish', '--trust-plugin',
  ];
  const run = spawnSync('claude', args, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, EXO_ROOT: ROOT } });
  if (!fs.existsSync(jsonPath)) throw new Error(`eval of ${name} did not finish`);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8')).cases;
}

function evalCase(name, maxCost) {
  const first = evalRuns(name, maxCost, 2);
  if (!first.some(needsThird)) return first;
  const spent = first.flatMap((testCase) => Object.values(testCase.arms ?? {}).flatMap((runs) => Object.values(runs))).reduce((sum, run) => sum + runCost(run), 0);
  if (maxCost - spent <= 0) return first;
  return mergeRuns(first, evalRuns(name, maxCost - spent, 1));
}

export function settle(row, withExo, without) {
  const costed = withExo.cost !== '-' && without.cost !== '-';
  const overBudget = costed && withExo.cost + without.cost > shareOf(row);
  const flat = costed && withExo.passed === 0 && without.passed === 0;
  const figure = (arm) => {
    if (overBudget) return 'fail';
    return flat ? 'void' : arm.passed;
  };
  return {
    ...row,
    with: figure(withExo),
    without: figure(without),
    'cost with': costed ? withExo.cost.toFixed(2) : '-',
    'cost without': costed ? without.cost.toFixed(2) : '-',
    date: new Date().toISOString().slice(0, 10),
    verdict: overBudget || flat ? 'not sure yet' : verdictOf(withExo, without),
    cut: withExo.cut + without.cut,
  };
}

const isCount = (value) => /^\d+$/.test(String(value));

export function regressions(oldRow, newRow) {
  const dropped = isCount(oldRow.with) && isCount(newRow.with) && Number(newRow.with) < Number(oldRow.with);
  return dropped ? [`regressed: ${newRow.part} was ${oldRow.with}, now ${newRow.with}`] : [];
}

function measure(row) {
  const cases = caseNames(row).flatMap((name) => evalCase(name, CASE_USD));
  return { ...settle(row, armFigures(cases, 'with'), armFigures(cases, 'without')), tally: { with: runTally(cases, 'with'), without: runTally(cases, 'without') } };
}

function runNext(text, rows, partName) {
  const target = partName ?? unmeasuredParts(rows)[0];
  if (target === undefined) {
    process.stdout.write('nothing left to measure\n');
    return text;
  }
  const row = rows.find((candidate) => candidate.part === target);
  if (!row) {
    process.stderr.write(`${USAGE}\n`);
    process.exit(2);
  }
  const measured = measure(row);
  const { cut, tally, ...figures } = measured;
  const counts = (arm) => `${tally[arm].passed}/${tally[arm].total} runs`;
  process.stdout.write(`${target}: with ${counts('with')}, without ${counts('without')}, ${figures.verdict}, cut ${cut}\n`);
  const lines = regressions(row, figures);
  for (const line of lines) process.stdout.write(`${line}\n`);
  if (lines.length > 0) process.exitCode = 1;
  return writeRows(text, rows.map((candidate) => (candidate.part === target ? figures : candidate)));
}

function report(problems) {
  for (const problem of problems) process.stdout.write(`${problem}\n`);
  process.exit(problems.length === 0 ? 0 : 1);
}

function main(mode, partName) {
  const text = fs.readFileSync(TABLE, 'utf8');
  const rows = readRows(text);
  if (mode === '--plan') {
    for (const step of planBudget(rows)) process.stdout.write(`${step.part} share ${step.share.toFixed(2)} ${step.fits ? 'measured' : 'not measured'} left ${step.left.toFixed(2)}\n`);
    return report(planProblems(rows, evalCaseNames()));
  }
  if (mode === '--run') return fs.writeFileSync(TABLE, runNext(text, rows, partName));
  process.stderr.write(`${USAGE}\n`);
  process.exit(2);
}

if (isMain(import.meta.url)) main(process.argv[2], process.argv[3]);
